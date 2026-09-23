import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { persistSubscriptionEntitlement } from "@/lib/billing-persist";
import { planIdFromSubscription } from "@/lib/billing-sync-select";
import { getStripe } from "@/lib/stripe";
import { throwOnSupabaseError } from "@/lib/supabase-write";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

async function resolveUserId(subscription: Stripe.Subscription, customerId?: string | null) {
  const fromMeta = subscription.metadata?.supabase_user_id;
  if (fromMeta) return fromMeta;

  if (!customerId) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  throwOnSupabaseError(error, "subscriptions lookup");
  return data?.user_id ?? null;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "缺少 webhook 設定" }, { status: 400 });
  }

  const stripe = getStripe();
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "簽章驗證失敗";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        if (userId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(String(session.subscription));
          await persistSubscriptionEntitlement({
            userId,
            customerId: typeof session.customer === "string" ? session.customer : null,
            status: sub.status,
            plan: planIdFromSubscription(sub) ?? "pro_monthly",
          });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : null;
        const userId = await resolveUserId(sub, customerId);
        if (userId) {
          await persistSubscriptionEntitlement({
            userId,
            customerId,
            status: sub.status,
            plan: planIdFromSubscription(sub) ?? "pro_monthly",
          });
        }
        break;
      }
      default:
        break;
    }
  } catch {
    return NextResponse.json({ error: "webhook 處理失敗" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
