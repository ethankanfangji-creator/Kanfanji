import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { throwOnSupabaseError } from "@/lib/supabase-write";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

export async function POST() {
  try {
    const priceId = process.env.STRIPE_PRICE_ID;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    if (!priceId) {
      return NextResponse.json({ error: "尚未設定 STRIPE_PRICE_ID" }, { status: 500 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) {
      return NextResponse.json({ error: "AUTH_LOOKUP_FAILED" }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    const stripe = getStripe();
    const admin = createAdminClient();

    const { data: existing, error: existingError } = await admin
      .from("subscriptions")
      .select("stripe_customer_id, status, plan")
      .eq("user_id", user.id)
      .maybeSingle();
    throwOnSupabaseError(existingError, "subscriptions lookup");

    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      const { error: upsertError } = await admin.from("subscriptions").upsert(
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          status: existing?.status ?? "inactive",
          plan: existing?.plan ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      throwOnSupabaseError(upsertError, "subscriptions upsert");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/?checkout=success`,
      cancel_url: `${siteUrl}/?checkout=cancel`,
      allow_promotion_codes: true,
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
    });

    if (!session.url) {
      return NextResponse.json({ error: "無法建立 Checkout Session" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json({ error: "CHECKOUT_FAILED" }, { status: 500 });
  }
}
