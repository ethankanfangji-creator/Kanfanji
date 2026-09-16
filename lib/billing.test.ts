import { describe, expect, it } from "vitest";
import {
  compareStripeEventOrder,
  projectStripeSubscription,
  subscriptionEntitlement,
} from "./billing";
import type Stripe from "stripe";

function subscription(status: Stripe.Subscription.Status): Stripe.Subscription {
  return {
    status,
    customer: "cus_1",
    items: { data: [{ price: { id: "price_pro" } }] },
  } as Stripe.Subscription;
}

describe("billing entitlement projection", () => {
  it.each(["canceled", "inactive", "unpaid", "past_due"])(
    "removes entitlement and plan for %s",
    (status) => {
      expect(subscriptionEntitlement(status)).toBe(false);
      expect(projectStripeSubscription(
        subscription(status as Stripe.Subscription.Status),
        "user-1",
      )).toMatchObject({ status, plan: null });
    },
  );

  it.each(["active", "trialing"])("grants entitlement for %s", (status) => {
    expect(subscriptionEntitlement(status)).toBe(true);
  });

  it("orders same-second cancellation after active regardless of delivery order", () => {
    const active = {
      created: 100,
      eventType: "customer.subscription.updated",
      status: "active",
      id: "evt_z",
    };
    const canceled = {
      created: 100,
      eventType: "customer.subscription.deleted",
      status: "canceled",
      id: "evt_a",
    };
    expect(compareStripeEventOrder(canceled, active)).toBeGreaterThan(0);
    expect(compareStripeEventOrder(active, canceled)).toBeLessThan(0);
  });
});
