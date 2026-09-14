import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isActiveSubscriptionStatus } from "@/lib/stripe";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

async function syncSubscription(
  userId: string,
  customerId: string | null,
  status: string,
  plan: string | null,
) {
  const admin = createAdminClient();
  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      status,
      plan,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  // Keep recent viewings' is_pro flag in sync for reporting
  if (isActiveSubscriptionStatus(status)) {
    await admin.from("viewings").update({ is_pro: true }).eq("user_id", userId);
  }
}

async function resolveUserId(subscription: Stripe.Subscription, customerId?: string | null) {
  const fromMeta = subscription.metadata?.supabase_user_id;
  if (fromMeta) return fromMeta;

  if (!customerId) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
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
          const plan =
            typeof sub.items.data[0]?.price?.id === "string"
              ? sub.items.data[0].price.id
              : "pro_monthly";
          await syncSubscription(
            userId,
            typeof session.customer === "string" ? session.customer : null,
            sub.status,
            plan,
          );
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : null;
        const userId = await resolveUserId(sub, customerId);
        if (userId) {
          const plan =
            typeof sub.items.data[0]?.price?.id === "string"
              ? sub.items.data[0].price.id
              : "pro_monthly";
          await syncSubscription(userId, customerId, sub.status, plan);
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook 處理失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
