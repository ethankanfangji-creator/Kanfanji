import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  requireAuthenticatedUser,
  requireStripeCustomerId,
} from "./billing-guards.ts";

describe("billing route guards", () => {
  it("returns 401 when not logged in", () => {
    assert.deepEqual(requireAuthenticatedUser(null), {
      status: 401,
      error: "請先登入",
      code: "UNAUTHORIZED",
    });
  });

  it("passes when user has an id", () => {
    assert.equal(requireAuthenticatedUser({ id: "u1" }), null);
  });

  it("returns 404 when Stripe customer is missing", () => {
    assert.deepEqual(requireStripeCustomerId(null), {
      status: 404,
      error: "尚未綁定 Stripe 顧客，請先完成結帳升級",
      code: "NO_STRIPE_CUSTOMER",
    });
  });

  it("passes when customer id is present", () => {
    assert.equal(requireStripeCustomerId("cus_123"), null);
  });
});
