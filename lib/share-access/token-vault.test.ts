import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { decryptShareToken, encryptShareToken } from "./token-vault";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("share token vault", () => {
  beforeEach(() => {
    process.env.SHARE_TOKEN_ENC_KEY = KEY;
  });

  it("round-trips a token", () => {
    const token = "a".repeat(64);
    const sealed = encryptShareToken(token, "link-1");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(decryptShareToken(sealed, "link-1")).toBe(token);
  });

  it("fails when the associated data changes", () => {
    const sealed = encryptShareToken("token-value", "link-1");
    expect(() => decryptShareToken(sealed, "link-2")).toThrow();
  });

  it("fails when a ciphertext byte changes", () => {
    const sealed = encryptShareToken("token-value", "link-1");
    const parts = sealed.split(".");
    const body = Buffer.from(parts[2]!, "base64url");
    body[0] = body[0]! ^ 1;
    parts[2] = body.toString("base64url");
    expect(() => decryptShareToken(parts.join("."), "link-1")).toThrow();
  });

  it("fails closed when the key is missing", () => {
    delete process.env.SHARE_TOKEN_ENC_KEY;
    expect(() => encryptShareToken("token-value", "link-1")).toThrow(/share_key_missing/);
  });

  it("does not embed the raw token", () => {
    const token = "PLAINTEXTTOKEN";
    const sealed = encryptShareToken(token, "link-1");
    expect(sealed.includes(token)).toBe(false);
    expect(createHash("sha256").update(token).digest("hex")).toHaveLength(64);
  });
});
