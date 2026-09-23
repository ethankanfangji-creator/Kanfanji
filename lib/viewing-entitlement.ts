/**
 * Pure free-tier create decision for node:test and API guards.
 * Keep in sync with lib/viewing-wizard/free-tier.ts (FREE_VIEWING_LIMIT = 3).
 * Authorization must use subscriptions.status — never viewings.is_pro.
 */
export const FREE_VIEWING_LIMIT = 3;

export type CreateViewingDecision =
  | { ok: true }
  | { ok: false; code: "FREE_LIMIT_REACHED" };

export function canCreateViewing(input: {
  isPro: boolean;
  freeCount: number;
  limit?: number;
}): CreateViewingDecision {
  const limit = input.limit ?? FREE_VIEWING_LIMIT;
  if (input.isPro) return { ok: true };
  if (input.freeCount >= limit) return { ok: false, code: "FREE_LIMIT_REACHED" };
  return { ok: true };
}
