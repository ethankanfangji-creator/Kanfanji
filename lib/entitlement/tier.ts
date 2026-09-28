import "server-only";
import { resolveProEntitlement } from "@/lib/billing-status";
import type { SupabaseClient } from "@supabase/supabase-js";

export class TierLookupError extends Error {
  constructor(message = "tier lookup failed") {
    super(message);
    this.name = "TierLookupError";
  }
}

export async function getAccountTier(
  admin: SupabaseClient,
  userId: string,
): Promise<"free" | "pro"> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("status, manual_pro_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new TierLookupError(error.message);
  return resolveProEntitlement(data ?? {}) ? "pro" : "free";
}
