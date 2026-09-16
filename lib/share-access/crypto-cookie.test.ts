import { describe, expect, it } from "vitest";
import {
  createShareUnlockCookieValue,
  hashSharePassword,
  shareUnlockCookieName,
  verifySharePassword,
  verifyShareUnlockCookieValue,
} from "./index";

describe("share password + unlock cookie", () => {
  it("hashes passwords without storing plaintext", async () => {
    const hash = await hashSharePassword("secret-pass");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash.includes("secret-pass")).toBe(false);
    expect(await verifySharePassword("secret-pass", hash)).toBe(true);
    expect(await verifySharePassword("wrong", hash)).toBe(false);
  });

  it("issues and verifies httpOnly-style unlock cookies", () => {
    const token = "a".repeat(64);
    const { value } = createShareUnlockCookieValue(token, 3, { ttlSeconds: 60 });
    expect(shareUnlockCookieName(token).startsWith("kf_su_")).toBe(true);
    expect(verifyShareUnlockCookieValue(token, 3, value)).toBe(true);
    expect(verifyShareUnlockCookieValue(token, 4, value)).toBe(false);
    expect(verifyShareUnlockCookieValue(token, 3, "tampered")).toBe(false);
    expect(verifyShareUnlockCookieValue("b".repeat(64), 3, value)).toBe(false);
  });

  it("caps cookie expiry by maximum TTL and link expiry", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    const linkExpiresAt = new Date(now.getTime() + 30_000).toISOString();
    const { expiresAt } = createShareUnlockCookieValue("a".repeat(64), 1, {
      ttlSeconds: 999_999,
      linkExpiresAt,
      now,
    });
    expect(expiresAt.toISOString()).toBe(linkExpiresAt);
  });
});
