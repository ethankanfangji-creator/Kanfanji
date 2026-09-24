/**
 * Presentational billing gates for the wizard shell.
 * Entitlement (`isPro`) must come from the server (subscriptions row / sync API) —
 * never from `?checkout=success` alone.
 */

export function shouldShowProBadge(isPro: boolean): boolean {
  return isPro;
}

export function shouldShowFreeQuota(input: {
  user: { id: string } | null | undefined;
  isPro: boolean;
}): boolean {
  return Boolean(input.user) && !input.isPro;
}

/** Manage subscription when Stripe customer exists or checkout timed out waiting for webhook. */
export function shouldShowBillingManageRow(input: {
  user: { id: string } | null | undefined;
  hasStripeCustomer: boolean;
  checkoutTimedOut: boolean;
}): boolean {
  return Boolean(input.user) && (input.hasStripeCustomer || input.checkoutTimedOut);
}

export function shouldShowManagePortalButton(input: {
  hasStripeCustomer: boolean;
}): boolean {
  return input.hasStripeCustomer;
}

/** Resync when webhook may be delayed or customer exists but not yet Pro. */
export function shouldShowResyncButton(input: {
  hasStripeCustomer: boolean;
  checkoutTimedOut: boolean;
  isPro: boolean;
}): boolean {
  return (input.checkoutTimedOut || input.hasStripeCustomer) && !input.isPro;
}

/** Paywall dialog: always allow resync after timeout or when a Stripe customer exists. */
export function shouldShowPaywallResyncButton(input: {
  hasStripeCustomer: boolean;
  checkoutTimedOut: boolean;
}): boolean {
  return input.checkoutTimedOut || input.hasStripeCustomer;
}
