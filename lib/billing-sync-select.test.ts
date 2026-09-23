import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isActiveSubscriptionStatus } from "./billing-status.ts";

/** Mirrors lib/billing-sync-select.ts for node:test (avoids @/ path + Stripe SDK in runner). */
function pickBestStripeSubscription(
  subscriptions: { id: string; status: string; created: number }[],
) {
  if (subscriptions.length === 0) return null;
  const entitled = subscriptions.filter((sub) =>
    isActiveSubscriptionStatus(sub.status),
  );
  const pool = entitled.length > 0 ? entitled : subscriptions;
  return [...pool].sort((a, b) => b.created - a.created)[0] ?? null;
}

describe("pickBestStripeSubscription", () => {
  it("prefers active over canceled", () => {
    const best = pickBestStripeSubscription([
      { id: "canceled", status: "canceled", created: 200 },
      { id: "active", status: "active", created: 100 },
    ]);
    assert.equal(best?.id, "active");
  });

  it("prefers newer among entitled", () => {
    const best = pickBestStripeSubscription([
      { id: "old", status: "trialing", created: 50 },
      { id: "new", status: "active", created: 90 },
    ]);
    assert.equal(best?.id, "new");
  });

  it("returns null for empty list", () => {
    assert.equal(pickBestStripeSubscription([]), null);
  });
});
