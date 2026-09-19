import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const AI_GUEST_COOKIE = "kf_ai_guest";
const COOKIE_VERSION = "v1";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type GuestIdentity = {
  guestId: string;
  deviceId: string;
};

function secret(): string | null {
  return process.env.AI_GUEST_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createGuestIdentityCookie(): {
  identity: GuestIdentity;
  value: string;
  maxAge: number;
} | null {
  const key = secret();
  if (!key) return null;
  const identity = { guestId: randomUUID(), deviceId: randomUUID() };
  const payload = `${COOKIE_VERSION}.${identity.guestId}.${identity.deviceId}`;
  return {
    identity,
    value: `${payload}.${sign(payload, key)}`,
    maxAge: MAX_AGE_SECONDS,
  };
}

export function verifyGuestIdentityCookie(value: string | undefined): GuestIdentity | null {
  const key = secret();
  if (!key || !value) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== COOKIE_VERSION) return null;
  const [version, guestId, deviceId, signature] = parts;
  if (!version || !guestId || !deviceId || !signature) return null;
  if (!/^[0-9a-f-]{36}$/i.test(guestId) || !/^[0-9a-f-]{36}$/i.test(deviceId)) return null;
  const payload = `${version}.${guestId}.${deviceId}`;
  const expected = sign(payload, key);
  try {
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (actualBytes.length !== expectedBytes.length) return null;
    if (!timingSafeEqual(actualBytes, expectedBytes)) return null;
    return { guestId, deviceId };
  } catch {
    return null;
  }
}

export function guestCookieOptions(maxAge = MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
