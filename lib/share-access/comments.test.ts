import { describe, expect, it } from "vitest";
import {
  normalizeCommentAuthor,
  normalizeCommentBody,
  optionalClientHash,
  shareCommentRateLimitKey,
} from "./comments";

describe("share report comments helpers", () => {
  it("normalizes optional author to guest fallback", () => {
    expect(normalizeCommentAuthor("  Ada  ", "訪客")).toBe("Ada");
    expect(normalizeCommentAuthor("", "訪客")).toBe("訪客");
    expect(normalizeCommentAuthor("x".repeat(80), "訪客").length).toBe(40);
  });

  it("rejects empty or oversized bodies", () => {
    expect(normalizeCommentBody("  hi  ")).toBe("hi");
    expect(normalizeCommentBody("")).toBeNull();
    expect(normalizeCommentBody("x".repeat(501))).toBeNull();
  });

  it("accepts only 64-char hex client hashes", () => {
    const ok = "a".repeat(64);
    expect(optionalClientHash(ok)).toBe(ok);
    expect(optionalClientHash("not-hex")).toBeNull();
  });

  it("builds a 64-char rate-limit key", () => {
    expect(shareCommentRateLimitKey("1.2.3.4", "t".repeat(64))).toMatch(/^[a-f0-9]{64}$/);
  });
});
