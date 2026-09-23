import type Stripe from "stripe";
import { isActiveSubscriptionStatus } from "@/lib/billing-status";

/** Prefer entitled subscriptions, then newest by created. */
export function pickBestStripeSubscription(
  subscriptions: Stripe.Subscription[],
): Stripe.Subscription | null {
  if (subscriptions.length === 0) return null;
  const entitled = subscriptions.filter((sub) =>
    isActiveSubscriptionStatus(sub.status),
  );
  const pool = entitled.length > 0 ? entitled : subscriptions;
  return [...pool].sort((a, b) => b.created - a.created)[0] ?? null;
}

export function planIdFromSubscription(subscription: Stripe.Subscription): string | null {
  const priceId = subscription.items.data[0]?.price?.id;
  return typeof priceId === "string" ? priceId : null;
}
