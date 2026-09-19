import type Stripe from "stripe";
import { createAdminClient } from "@/utils/supabase/admin";

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export function stripeEventSafetyRank(eventType: string, status: string): number {
  if (eventType === "customer.subscription.deleted" || status === "canceled") return 3;
  return subscriptionEntitlement(status) ? 1 : 2;
}

export function compareStripeEventOrder(
  left: { created: number; eventType: string; status: string; id: string },
  right: { created: number; eventType: string; status: string; id: string },
): number {
  return (
    left.created - right.created ||
    stripeEventSafetyRank(left.eventType, left.status) -
      stripeEventSafetyRank(right.eventType, right.status) ||
    left.id.localeCompare(right.id)
  );
}

export function subscriptionEntitlement(status?: string | null): boolean {
  return Boolean(status && ACTIVE_SUBSCRIPTION_STATUSES.has(status));
}

export type StripeSubscriptionProjection = {
  userId: string | null;
  customerId: string | null;
  status: string | null;
  plan: string | null;
};

export function projectStripeSubscription(
  subscription: Stripe.Subscription,
  userId: string | null,
): StripeSubscriptionProjection {
  const status = subscription.status;
  return {
    userId,
    customerId:
      typeof subscription.customer === "string" ? subscription.customer : null,
    status,
    plan: subscriptionEntitlement(status)
      ? (subscription.items.data[0]?.price?.id ?? null)
      : null,
  };
}

export async function persistStripeEvent(
  event: Stripe.Event,
  projection: StripeSubscriptionProjection = {
    userId: null,
    customerId: null,
    status: null,
    plan: null,
  },
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("process_stripe_subscription_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created: event.created,
    p_user_id: projection.userId,
    p_customer_id: projection.customerId,
    p_status: projection.status,
    p_plan: projection.plan,
  });
  if (error) throw new Error("BILLING_PERSISTENCE_FAILED");
  const row = Array.isArray(data) ? data[0] : data;
  const outcome =
    row && typeof row === "object" && "outcome" in row
      ? String(row.outcome)
      : null;
  if (!outcome) throw new Error("BILLING_PERSISTENCE_FAILED");
  return outcome;
}
