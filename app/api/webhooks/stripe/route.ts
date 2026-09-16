import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  persistStripeEvent,
  projectStripeSubscription,
  type StripeSubscriptionProjection,
} from "@/lib/billing";
import { getStripe } from "@/lib/stripe";
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
  if (error) throw new Error("BILLING_LOOKUP_FAILED");
  return data?.user_id ?? null;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "INVALID_WEBHOOK" }, { status: 400 });
  }

  let stripe: ReturnType<typeof getStripe>;
  let body: string;
  try {
    stripe = getStripe();
    body = await request.text();
  } catch {
    return NextResponse.json({ error: "WEBHOOK_PROCESSING_FAILED" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "INVALID_WEBHOOK_SIGNATURE" }, { status: 400 });
  }

  try {
    let projection: StripeSubscriptionProjection | undefined;
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        if (userId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(String(session.subscription));
          projection = projectStripeSubscription(sub, userId);
          if (!projection.customerId && typeof session.customer === "string") {
            projection.customerId = session.customer;
          }
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : null;
        const userId = await resolveUserId(sub, customerId);
        projection = projectStripeSubscription(sub, userId);
        break;
      }
      default:
        break;
    }
    const outcome = await persistStripeEvent(event, projection);
    return NextResponse.json({ received: true, outcome });
  } catch {
    // Stripe retries 5xx responses. Never leak provider/database details.
    return NextResponse.json({ error: "WEBHOOK_PROCESSING_FAILED" }, { status: 500 });
  }
}
