import { describe, expect, it } from "vitest";
import {
  shouldShowBillingManageRow,
  shouldShowFreeQuota,
  shouldShowManagePortalButton,
  shouldShowPaywallResyncButton,
  shouldShowProBadge,
  shouldShowResyncButton,
} from "./billing-ui";

describe("billing-ui gates (server entitlement only)", () => {
  it("shows PRO badge only when isPro from server is true", () => {
    expect(shouldShowProBadge(true)).toBe(true);
    expect(shouldShowProBadge(false)).toBe(false);
  });

  it("shows free quota for signed-in non-Pro users", () => {
    expect(shouldShowFreeQuota({ user: { id: "u1" }, isPro: false })).toBe(true);
    expect(shouldShowFreeQuota({ user: { id: "u1" }, isPro: true })).toBe(false);
    expect(shouldShowFreeQuota({ user: null, isPro: false })).toBe(false);
  });

  it("shows manage row for Stripe customer or checkout timeout", () => {
    expect(
      shouldShowBillingManageRow({
        user: { id: "u1" },
        hasStripeCustomer: true,
        checkoutTimedOut: false,
      }),
    ).toBe(true);
    expect(
      shouldShowBillingManageRow({
        user: { id: "u1" },
        hasStripeCustomer: false,
        checkoutTimedOut: true,
      }),
    ).toBe(true);
    expect(
      shouldShowBillingManageRow({
        user: null,
        hasStripeCustomer: true,
        checkoutTimedOut: true,
      }),
    ).toBe(false);
  });

  it("resync in header only when not yet Pro", () => {
    expect(
      shouldShowResyncButton({
        hasStripeCustomer: true,
        checkoutTimedOut: false,
        isPro: false,
      }),
    ).toBe(true);
    expect(
      shouldShowResyncButton({
        hasStripeCustomer: true,
        checkoutTimedOut: false,
        isPro: true,
      }),
    ).toBe(false);
  });

  it("paywall resync does not require !isPro (dialog may still poll)", () => {
    expect(
      shouldShowPaywallResyncButton({ hasStripeCustomer: false, checkoutTimedOut: true }),
    ).toBe(true);
    expect(shouldShowManagePortalButton({ hasStripeCustomer: true })).toBe(true);
  });
});
