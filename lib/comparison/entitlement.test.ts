import { describe, expect, it } from "vitest";
import { canSelectMore, decideCompareStart } from "./entitlement";

const base = { hasFreeSlot: false, freeSlotMatches: false, hasAnyCompare: false };

describe("decideCompareStart", () => {
  it("covers the entitlement truth table", () => {
    expect(decideCompareStart({ ...base, tier: "guest", itemCount: 2 }).ok).toBe(false);
    expect(decideCompareStart({ ...base, tier: "free", itemCount: 1 })).toEqual({ ok: false, reason: "too_few_items" });
    expect(decideCompareStart({ ...base, tier: "free", itemCount: 2 })).toEqual({ ok: true, consumesFreeSlot: true });
    expect(decideCompareStart({ ...base, tier: "free", itemCount: 3 })).toEqual({ ok: false, reason: "too_many_items" });
    expect(
      decideCompareStart({ tier: "free", itemCount: 2, hasFreeSlot: true, freeSlotMatches: true, hasAnyCompare: true }),
    ).toEqual({ ok: true, consumesFreeSlot: false });
    expect(
      decideCompareStart({ tier: "free", itemCount: 2, hasFreeSlot: true, freeSlotMatches: false, hasAnyCompare: true }),
    ).toEqual({ ok: false, reason: "upgrade_required" });
    expect(
      decideCompareStart({ tier: "free", itemCount: 2, hasFreeSlot: false, freeSlotMatches: false, hasAnyCompare: true }),
    ).toEqual({ ok: false, reason: "upgrade_required" });
    expect(decideCompareStart({ ...base, tier: "pro", itemCount: 5 })).toEqual({ ok: true, consumesFreeSlot: false });
    expect(decideCompareStart({ ...base, tier: "pro", itemCount: 6 })).toEqual({ ok: false, reason: "too_many_items" });
    expect(canSelectMore("free", 2)).toBe(false);
    expect(canSelectMore("pro", 4)).toBe(true);
    expect(canSelectMore("pro", 5)).toBe(false);
  });
});
