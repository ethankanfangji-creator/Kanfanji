import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountTier, TierLookupError } from "@/lib/entitlement/tier";
import { canCreateCloudViewing, FREE_VIEWING_LIMIT } from "@/lib/viewing-wizard/free-tier";

export type CreateViewingInput = {
  id: string;
  address: string;
  idempotencyKey: string;
  clientUpdatedAt?: string;
  messages?: unknown[];
  report?: unknown | null;
  metadata?: unknown | null;
  chatState?: unknown | null;
};

export type CreateViewingResult = {
  outcome: "created" | "exists" | "limit_reached";
  id: string;
  freeCount: number;
  limit: number;
  isPro: boolean;
  revision?: number;
};

export async function createViewingRow(
  admin: SupabaseClient,
  userId: string,
  input: CreateViewingInput,
): Promise<CreateViewingResult> {
  const existing = await admin
    .from("viewings")
    .select("id, revision")
    .eq("user_id", userId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) {
    return {
      outcome: "exists",
      id: String(existing.data.id),
      freeCount: 0,
      limit: FREE_VIEWING_LIMIT,
      isPro: false,
      revision: Number((existing.data as { revision?: number }).revision ?? 1),
    };
  }

  await admin.rpc("lock_viewing_create", { p_user_id: userId });

  const counted = await admin
    .from("viewings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (counted.error) throw counted.error;
  let isPro = false;
  try {
    isPro = (await getAccountTier(admin, userId)) === "pro";
  } catch (error) {
    if (!(error instanceof TierLookupError)) throw error;
    isPro = false;
  }
  const freeCount = counted.count ?? 0;
  const decision = canCreateCloudViewing({
    viewingId: null,
    freeCount,
    isPro,
    authenticated: true,
  });
  if (!decision.allowed) {
    return {
      outcome: "limit_reached",
      id: input.id,
      freeCount,
      limit: FREE_VIEWING_LIMIT,
      isPro,
    };
  }

  const inserted = await admin
    .from("viewings")
    .insert({
      id: input.id,
      address: input.address,
      user_id: userId,
      idempotency_key: input.idempotencyKey,
      messages: input.messages ?? [],
      report: input.report ?? null,
      metadata: input.metadata ?? {},
      chat_state: input.chatState ?? null,
      client_updated_at: input.clientUpdatedAt ?? new Date().toISOString(),
      is_pro: isPro,
      revision: 1,
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return {
    outcome: "created",
    id: String(inserted.data.id),
    freeCount: freeCount + 1,
    limit: FREE_VIEWING_LIMIT,
    isPro,
    revision: 1,
  };
}
