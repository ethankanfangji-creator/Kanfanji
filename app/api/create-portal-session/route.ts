import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  requireStripeCustomerId,
} from "@/lib/billing-guards";
import { getStripe } from "@/lib/stripe";
import { throwOnSupabaseError } from "@/lib/supabase-write";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
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

    const admin = createAdminClient();
    const { data: sub, error } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user!.id)
      .maybeSingle();
    throwOnSupabaseError(error, "subscriptions lookup");

    const customerFail = requireStripeCustomerId(sub?.stripe_customer_id);
    if (customerFail) {
      return NextResponse.json(
        { error: customerFail.error, code: customerFail.code },
        { status: customerFail.status },
      );
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: sub!.stripe_customer_id as string,
      return_url: `${siteUrl}/`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "無法建立 Billing Portal Session" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Portal 失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
