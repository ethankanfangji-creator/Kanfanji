/** Client-safe subscription entitlement helpers. Do not import Stripe here. */

export function isActiveSubscriptionStatus(status?: string | null) {
  return status === "active" || status === "trialing";
}

export function resolveProEntitlement(
  row: { status?: string | null; manual_pro_until?: string | null },
  now = new Date(),
) {
  if (isActiveSubscriptionStatus(row.status)) return true;
  if (!row.manual_pro_until) return false;
  const until = new Date(row.manual_pro_until);
  return !Number.isNaN(until.getTime()) && until > now;
}

/**
 * Returning from Stripe Checkout with `?checkout=success` is not proof of payment.
 * Entitlement comes only from the persisted subscriptions row.
 */
export function isProFromCheckoutReturn(subscriptionStatus?: string | null) {
  return isActiveSubscriptionStatus(subscriptionStatus);
}
