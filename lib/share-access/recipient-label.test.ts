import { describe, expect, it } from "vitest";
import { normalizeRecipientLabel } from "./server";

describe("normalizeRecipientLabel", () => {
  it("trims and caps at 40 chars", () => {
    expect(normalizeRecipientLabel("  媽媽  ")).toBe("媽媽");
    expect(normalizeRecipientLabel("a".repeat(50))).toBe("a".repeat(40));
  });

  it("returns null for empty or non-string", () => {
    expect(normalizeRecipientLabel("")).toBeNull();
    expect(normalizeRecipientLabel("   ")).toBeNull();
    expect(normalizeRecipientLabel(null)).toBeNull();
    expect(normalizeRecipientLabel(12)).toBeNull();
  });
});
