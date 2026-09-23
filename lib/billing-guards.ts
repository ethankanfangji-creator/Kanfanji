/** Pure guards for billing routes — easy to unit-test without Next/Stripe. */

export type BillingGuardFailure = {
  status: number;
  error: string;
  code: string;
};

export function requireAuthenticatedUser(
  user: { id: string } | null | undefined,
): BillingGuardFailure | null {
  if (!user?.id) {
    return { status: 401, error: "請先登入", code: "UNAUTHORIZED" };
  }
  return null;
}

export function requireStripeCustomerId(
  customerId: string | null | undefined,
): BillingGuardFailure | null {
  if (!customerId) {
    return {
      status: 404,
      error: "尚未綁定 Stripe 顧客，請先完成結帳升級",
      code: "NO_STRIPE_CUSTOMER",
    };
  }
  return null;
}
