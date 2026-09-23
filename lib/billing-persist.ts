import { isActiveSubscriptionStatus } from "@/lib/billing-status";
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
    isPro: isActiveSubscriptionStatus(input.status),
    plan: input.plan,
  };
}
