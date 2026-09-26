/** Client-safe subscription entitlement helpers. Do not import Stripe here. */

/**
 * Columns the authenticated browser client may SELECT on `subscriptions`.
 * `stripe_customer_id` is service-role only — including it fails the whole query
 * under least-privilege grants, so Pro (Stripe or manual) never applies.
 */
export const CLIENT_SUBSCRIPTION_SELECT = "status, plan, manual_pro_until" as const;

const STRIPE_CUSTOMER_STATUSES = new Set([
  "active",
  "trialing",
  "canceled",
  "past_due",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
]);

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

/** Infer a Stripe customer without reading `stripe_customer_id`. */
export function hasStripeCustomerFromClientRow(
  row: { status?: string | null; plan?: string | null } | null | undefined,
): boolean {
  if (!row) return false;
  if (typeof row.plan === "string" && row.plan.trim()) return true;
  return STRIPE_CUSTOMER_STATUSES.has(row.status ?? "");
}

/**
 * Returning from Stripe Checkout with `?checkout=success` is not proof of payment.
 * Entitlement comes only from the persisted subscriptions row.
 */
export function isProFromCheckoutReturn(subscriptionStatus?: string | null) {
  return isActiveSubscriptionStatus(subscriptionStatus);
}
