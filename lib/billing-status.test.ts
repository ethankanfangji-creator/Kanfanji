import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLIENT_SUBSCRIPTION_SELECT,
  hasStripeCustomerFromClientRow,
  isActiveSubscriptionStatus,
  isProFromCheckoutReturn,
  resolveProEntitlement,
} from "./billing-status.ts";

describe("isProFromCheckoutReturn", () => {
  it("does not grant Pro from the checkout success query param alone", () => {
    assert.equal(isProFromCheckoutReturn(null), false);
    assert.equal(isProFromCheckoutReturn("inactive"), false);
    assert.equal(isProFromCheckoutReturn("canceled"), false);
  });

  it("grants Pro only when the subscriptions row is active or trialing", () => {
    assert.equal(isProFromCheckoutReturn("active"), true);
    assert.equal(isProFromCheckoutReturn("trialing"), true);
  });
});

describe("isActiveSubscriptionStatus", () => {
  it("treats active and trialing as entitled", () => {
    assert.equal(isActiveSubscriptionStatus("active"), true);
    assert.equal(isActiveSubscriptionStatus("trialing"), true);
  });

  it("treats past_due, canceled, and undefined as inactive", () => {
    assert.equal(isActiveSubscriptionStatus("past_due"), false);
    assert.equal(isActiveSubscriptionStatus("canceled"), false);
    assert.equal(isActiveSubscriptionStatus(undefined), false);
  });
});

describe("resolveProEntitlement", () => {
  const now = new Date("2026-09-25T12:00:00.000Z");

  it("is true for an active or trialing Stripe status", () => {
    assert.equal(resolveProEntitlement({ status: "active" }, now), true);
    assert.equal(resolveProEntitlement({ status: "trialing" }, now), true);
  });

  it("uses a future manual override when Stripe is inactive", () => {
    assert.equal(
      resolveProEntitlement(
        { status: "inactive", manual_pro_until: "2026-10-01T00:00:00.000Z" },
        now,
      ),
      true,
    );
    assert.equal(
      resolveProEntitlement(
        { status: "canceled", manual_pro_until: "2026-10-01T00:00:00.000Z" },
        now,
      ),
      true,
    );
  });

  it("is false when the manual override is missing or already past", () => {
    assert.equal(resolveProEntitlement({ status: "inactive" }, now), false);
    assert.equal(
      resolveProEntitlement(
        { status: "inactive", manual_pro_until: "2026-09-01T00:00:00.000Z" },
        now,
      ),
      false,
    );
  });
});

describe("CLIENT_SUBSCRIPTION_SELECT", () => {
  it("only asks for columns authenticated clients are granted", () => {
    assert.equal(CLIENT_SUBSCRIPTION_SELECT.includes("stripe_customer_id"), false);
    assert.match(CLIENT_SUBSCRIPTION_SELECT, /\bstatus\b/);
    assert.match(CLIENT_SUBSCRIPTION_SELECT, /\bplan\b/);
    assert.match(CLIENT_SUBSCRIPTION_SELECT, /\bmanual_pro_until\b/);
  });
});

describe("hasStripeCustomerFromClientRow", () => {
  it("is false for a missing row or manual-Pro inactive row", () => {
    assert.equal(hasStripeCustomerFromClientRow(null), false);
    assert.equal(hasStripeCustomerFromClientRow({ status: "inactive" }), false);
  });

  it("is true when a Stripe plan or Stripe-like status is present", () => {
    assert.equal(hasStripeCustomerFromClientRow({ status: "inactive", plan: "price_pro" }), true);
    assert.equal(hasStripeCustomerFromClientRow({ status: "active" }), true);
    assert.equal(hasStripeCustomerFromClientRow({ status: "canceled" }), true);
  });
});
