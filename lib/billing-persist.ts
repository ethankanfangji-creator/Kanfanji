import { isActiveSubscriptionStatus, resolveProEntitlement } from "@/lib/billing-status";
import { throwOnSupabaseError } from "@/lib/supabase-write";
import { createAdminClient } from "@/utils/supabase/admin";

/** Shared by Stripe webhook + manual billing sync. Never ACK without checking errors. */
export async function persistSubscriptionEntitlement(input: {
  userId: string;
  customerId: string | null;
  status: string;
  plan: string | null;
}) {
  const admin = createAdminClient();
  const { data: preserved, error: preservedError } = await admin
    .from("subscriptions")
    .select("manual_pro_until")
    .eq("user_id", input.userId)
    .maybeSingle();
  throwOnSupabaseError(preservedError, "subscriptions manual pro");

  const { error: upsertError } = await admin.from("subscriptions").upsert(
    {
      user_id: input.userId,
      stripe_customer_id: input.customerId,
      status: input.status,
      plan: input.plan,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  throwOnSupabaseError(upsertError, "subscriptions upsert");

  const { error: viewingError } = await admin
    .from("viewings")
    .update({ is_pro: isActiveSubscriptionStatus(input.status) })
    .eq("user_id", input.userId);
  throwOnSupabaseError(viewingError, "viewings is_pro sync");

  return {
    status: input.status,
    isPro: resolveProEntitlement({
      status: input.status,
      manual_pro_until: preserved?.manual_pro_until,
    }),
    plan: input.plan,
  };
}
