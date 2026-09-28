import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const LEGACY = /^[a-f0-9]{64}$/i;

export type ResolvedShare =
  | { status: "active"; snapshot: unknown; expiresAt: string; createdAt: string; ownerId: string }
  | { status: "legacy" }
  | { status: "invalid" };

export async function resolveCompareShare(token: string): Promise<ResolvedShare> {
  if (LEGACY.test(token) && !TOKEN.test(token)) return { status: "legacy" };
  if (!TOKEN.test(token)) return { status: "invalid" };
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("compare_shares")
    .select("snapshot, expires_at, created_at, user_id, status")
    .eq("token_hash", tokenHash)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data || !data.snapshot || new Date(data.expires_at).getTime() <= Date.now()) {
    return { status: "invalid" };
  }
  return {
    status: "active",
    snapshot: data.snapshot,
    expiresAt: data.expires_at,
    createdAt: data.created_at,
    ownerId: data.user_id,
  };
}
