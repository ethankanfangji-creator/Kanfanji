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
    const { value } = createShareUnlockCookieValue(token, 60);
    expect(shareUnlockCookieName(token).startsWith("kf_su_")).toBe(true);
    expect(verifyShareUnlockCookieValue(token, value)).toBe(true);
    expect(verifyShareUnlockCookieValue(token, "tampered")).toBe(false);
    expect(verifyShareUnlockCookieValue("b".repeat(64), value)).toBe(false);
  });
});
