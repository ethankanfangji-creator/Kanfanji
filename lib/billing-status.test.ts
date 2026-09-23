import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isActiveSubscriptionStatus,
  isProFromCheckoutReturn,
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
