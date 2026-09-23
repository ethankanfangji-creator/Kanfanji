import { createHash, randomBytes } from "node:crypto";

/** 32 bytes → 64 hex chars. Prefer this over UUID-without-dashes for new links. */
export function generateShareToken(): string {
  return randomBytes(32).toString("hex");
}

export function isShareTokenFormat(token: string): boolean {
  const t = token.trim();
  // Accept legacy UUID-hex (32) and new 64-hex tokens.
  return /^[a-f0-9]{32}$/i.test(t) || /^[a-f0-9]{64}$/i.test(t);
}

/** One-way fingerprint for logs / analytics — never log raw tokens. */
export function shareTokenFingerprint(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex").slice(0, 12);
}

/**
 * Password hashing must run server-side only.
 * Stub uses scrypt via Node crypto; production may switch to argon2id package.
 */
export async function hashSharePassword(password: string): Promise<string> {
  const { scrypt, randomBytes: rb } = await import("node:crypto");
  const { promisify } = await import("node:util");
  const scryptAsync = promisify(scrypt);
  const salt = rb(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifySharePassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  if (!salt || !hash) return false;
  const { scrypt } = await import("node:crypto");
  const { promisify } = await import("node:util");
  const scryptAsync = promisify(scrypt);
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const a = Buffer.from(hash, "hex");
  const b = derived;
  if (a.length !== b.length) return false;
  // timingSafeEqual requires same length
  const { timingSafeEqual } = await import("node:crypto");
  return timingSafeEqual(a, b);
}
