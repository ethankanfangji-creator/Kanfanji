/** Client-safe subscription entitlement helpers. Do not import Stripe here. */

export function isActiveSubscriptionStatus(status?: string | null) {
  return status === "active" || status === "trialing";
}

/**
 * Returning from Stripe Checkout with `?checkout=success` is not proof of payment.
 * Entitlement comes only from the persisted subscriptions row.
 */
export function isProFromCheckoutReturn(subscriptionStatus?: string | null) {
  return isActiveSubscriptionStatus(subscriptionStatus);
}
