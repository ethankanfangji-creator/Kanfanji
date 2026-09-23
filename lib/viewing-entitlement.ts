/**
 * Free-tier cap for logged-in non-Pro users.
 * Count = rows in `public.viewings` for that user_id (no soft-delete column today).
 * Authorization must use subscriptions.status via isActiveSubscriptionStatus — never viewings.is_pro.
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
