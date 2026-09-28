import { COMPARE_MAX } from "./types";

export const FREE_COMPARE_MAX_ITEMS = 2;
export const PRO_COMPARE_MAX_ITEMS = COMPARE_MAX;

export type CompareTier = "guest" | "free" | "pro";
export type CompareGateReason = "login_required" | "upgrade_required" | "too_many_items";

export function maxCompareItems(tier: CompareTier): number {
  if (tier === "pro") return PRO_COMPARE_MAX_ITEMS;
  return FREE_COMPARE_MAX_ITEMS;
}

export function canSelectMore(tier: CompareTier, selectedCount: number): boolean {
  return selectedCount < maxCompareItems(tier);
}

export function decideCompareStart(input: {
  tier: CompareTier;
  itemCount: number;
  hasFreeSlot: boolean;
  freeSlotMatches: boolean;
  hasAnyCompare: boolean;
}): { ok: true; consumesFreeSlot: boolean } | { ok: false; reason: CompareGateReason | "too_few_items" } {
  if (input.itemCount < 2) return { ok: false, reason: "too_few_items" };
  if (input.tier === "guest") return { ok: false, reason: "login_required" };
  if (input.tier === "pro") {
    if (input.itemCount > PRO_COMPARE_MAX_ITEMS) return { ok: false, reason: "too_many_items" };
    return { ok: true, consumesFreeSlot: false };
  }
  if (input.freeSlotMatches) {
    return input.itemCount <= FREE_COMPARE_MAX_ITEMS
      ? { ok: true, consumesFreeSlot: false }
      : { ok: false, reason: "too_many_items" };
  }
  if (input.hasAnyCompare) return { ok: false, reason: "upgrade_required" };
  if (input.itemCount > FREE_COMPARE_MAX_ITEMS) return { ok: false, reason: "too_many_items" };
  return { ok: true, consumesFreeSlot: true };
}
