import { describe, expect, it } from "vitest";
import { hashSharePassword, verifySharePassword } from "./crypto";

describe("share password crypto (legacy helpers)", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashSharePassword("secret-pass");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifySharePassword("secret-pass", hash)).toBe(true);
    expect(await verifySharePassword("wrong", hash)).toBe(false);
  });
});
