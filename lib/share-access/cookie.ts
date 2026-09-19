import { createHmac, timingSafeEqual } from "node:crypto";
import { shareTokenFingerprint } from "./crypto";

const COOKIE_PREFIX = "kf_su_";
export const MAX_SHARE_UNLOCK_TTL_SECONDS = 60 * 60 * 12;

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
  accessVersion: number,
  options?: { ttlSeconds?: number; linkExpiresAt?: string | null; now?: Date },
): { value: string; expiresAt: Date } {
  const now = options?.now ?? new Date();
  const ttl = Math.max(
    1,
    Math.min(options?.ttlSeconds ?? MAX_SHARE_UNLOCK_TTL_SECONDS, MAX_SHARE_UNLOCK_TTL_SECONDS),
  );
  const requestedExp = Math.floor(now.getTime() / 1000) + ttl;
  const parsedLinkExp = options?.linkExpiresAt
    ? Math.floor(new Date(options.linkExpiresAt).getTime() / 1000)
    : Number.POSITIVE_INFINITY;
  const linkExp = Number.isFinite(parsedLinkExp)
    ? parsedLinkExp
    : Number.POSITIVE_INFINITY;
  const exp = Math.min(requestedExp, linkExp);
  const fp = shareTokenFingerprint(token);
  const payload = `${fp}.${accessVersion}.${exp}`;
  const sig = createHmac("sha256", cookieSecret()).update(payload).digest("hex");
  return {
    value: `${payload}.${sig}`,
    expiresAt: new Date(exp * 1000),
  };
}

export function verifyShareUnlockCookieValue(
  token: string,
  accessVersion: number,
  cookieValue: string | undefined,
): boolean {
  if (!cookieValue) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 4) return false;
  const [fp, versionStr, expStr, sig] = parts;
  if (!fp || !versionStr || !expStr || !sig) return false;
  if (Number(versionStr) !== accessVersion) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expectedFp = shareTokenFingerprint(token);
  if (fp !== expectedFp) return false;
  const payload = `${fp}.${versionStr}.${expStr}`;
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
