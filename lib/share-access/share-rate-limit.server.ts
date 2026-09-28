import { createAdminClient } from "@/utils/supabase/admin";
import { intelKeyFingerprint } from "@/lib/ai-boundary/quota";

export function chatShareTtlDays(): number {
  const raw = Number(process.env.CHAT_SHARE_TTL_DAYS ?? 30);
  if (!Number.isInteger(raw)) return 30;
  return Math.max(1, Math.min(90, raw));
}

export function chatShareExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + chatShareTtlDays() * 86_400_000).toISOString();
}

export async function consumeShareCreateRateLimit(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_ai_quota_internal", {
    p_keys: [`share:u:${intelKeyFingerprint(userId)}`],
    p_limits: [10],
    p_window_seconds: 3600,
  });
  if (error || !data) throw new Error("SHARE_UNAVAILABLE");
  const row = Array.isArray(data) ? data[0] : data;
  return row?.allowed === true;
}
