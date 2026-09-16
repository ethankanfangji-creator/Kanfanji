import { createHmac, timingSafeEqual } from "node:crypto";
import { shareTokenFingerprint } from "./crypto";

const COOKIE_PREFIX = "kf_su_";

function cookieSecret(): string {
  return (
    process.env.SHARE_COOKIE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-insecure-share-cookie-secret"
  );
}

export function shareUnlockCookieName(token: string): string {
  return `${COOKIE_PREFIX}${shareTokenFingerprint(token)}`;
}

/** Signed unlock cookie value — no password, no raw token. */
export function createShareUnlockCookieValue(
  token: string,
  ttlSeconds = 60 * 60 * 12,
): { value: string; expiresAt: Date } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const fp = shareTokenFingerprint(token);
  const payload = `${fp}.${exp}`;
  const sig = createHmac("sha256", cookieSecret()).update(payload).digest("hex");
  return {
    value: `${payload}.${sig}`,
    expiresAt: new Date(exp * 1000),
  };
}

export function verifyShareUnlockCookieValue(
  token: string,
  cookieValue: string | undefined,
): boolean {
  if (!cookieValue) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;
  const [fp, expStr, sig] = parts;
  if (!fp || !expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expectedFp = shareTokenFingerprint(token);
  if (fp !== expectedFp) return false;
  const payload = `${fp}.${expStr}`;
  const expectedSig = createHmac("sha256", cookieSecret()).update(payload).digest("hex");
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expectedSig, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
