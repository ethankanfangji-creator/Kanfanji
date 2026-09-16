import Stripe from "stripe";
import { subscriptionEntitlement } from "@/lib/billing";

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

export function isActiveSubscriptionStatus(status?: string | null) {
  return subscriptionEntitlement(status);
}
