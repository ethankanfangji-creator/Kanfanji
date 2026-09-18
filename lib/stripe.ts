import Stripe from "stripe";

export { isActiveSubscriptionStatus } from "@/lib/billing-status";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("尚未設定 STRIPE_SECRET_KEY");
  }
  return new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
}
