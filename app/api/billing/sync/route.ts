import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  requireStripeCustomerId,
} from "@/lib/billing-guards";
import { persistSubscriptionEntitlement } from "@/lib/billing-persist";
import {
  pickBestStripeSubscription,
  planIdFromSubscription,
} from "@/lib/billing-sync-select";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe";
import { throwOnSupabaseError } from "@/lib/supabase-write";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

/** Manual Stripe↔DB reconcile when webhook is delayed/failed. Future AI routes can reuse the same entitlement read. */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const authFail = requireAuthenticatedUser(user);
    if (authFail) {
      return NextResponse.json(
        { error: authFail.error, code: authFail.code },
        { status: authFail.status },
      );
    }

    const rate = consumeRateLimit(`billing-sync:${user!.id}`, {
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (!rate.ok) {
      return NextResponse.json(
        {
          error: "同步過於頻繁，請稍後再試",
          code: "RATE_LIMITED",
          retryAfterSec: rate.retryAfterSec,
        },
        { status: 429 },
      );
    }

    const admin = createAdminClient();
    // Only the caller's own subscriptions row — never accept another user's customer id.
    const { data: row, error } = await admin
      .from("subscriptions")
      .select("stripe_customer_id, status, plan")
      .eq("user_id", user!.id)
      .maybeSingle();
    throwOnSupabaseError(error, "subscriptions lookup");

    const customerFail = requireStripeCustomerId(row?.stripe_customer_id);
    if (customerFail) {
      return NextResponse.json(
        { error: customerFail.error, code: customerFail.code },
        { status: customerFail.status },
      );
    }

    const customerId = row!.stripe_customer_id as string;
    const stripe = getStripe();
    const listed = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });

    const best = pickBestStripeSubscription(listed.data);
    if (!best) {
      const summary = await persistSubscriptionEntitlement({
        userId: user!.id,
        customerId,
        status: "inactive",
        plan: null,
      });
      return NextResponse.json(summary);
    }

    const summary = await persistSubscriptionEntitlement({
      userId: user!.id,
      customerId,
      status: best.status,
      plan: planIdFromSubscription(best) ?? row?.plan ?? null,
    });
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
