import { createHmac } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import type { GuestIdentity } from "./guest-identity";

type QuotaIdentity =
  | { kind: "guest"; guest: GuestIdentity }
  | { kind: "user"; userId: string; deviceId: string };

export type QuotaResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number; code: "ai_quota_exceeded" | "ai_quota_unavailable" };

function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) ? Math.max(1, Math.min(value, 10_000)) : fallback;
}

export function fingerprint(value: string): string {
  const secret = process.env.AI_QUOTA_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("quota secret missing");
  return createHmac("sha256", secret).update(value).digest("hex");
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function consumeAiQuota(
  request: Request,
  identity: QuotaIdentity,
): Promise<QuotaResult> {
  try {
    const windowSeconds = envLimit("AI_QUOTA_WINDOW_SECONDS", 86_400);
    const dimensions =
      identity.kind === "guest"
        ? [
            ["guest", identity.guest.guestId, envLimit("AI_GUEST_DAILY_LIMIT", 5)],
            ["device", identity.guest.deviceId, envLimit("AI_DEVICE_DAILY_LIMIT", 10)],
            ["ip", clientIp(request), envLimit("AI_IP_DAILY_LIMIT", 30)],
          ]
        : [
            ["user", identity.userId, envLimit("AI_USER_DAILY_LIMIT", 30)],
            ["device", identity.deviceId, envLimit("AI_DEVICE_DAILY_LIMIT", 10)],
            ["ip", clientIp(request), envLimit("AI_IP_DAILY_LIMIT", 30)],
          ];
    const keys = dimensions.map(([type, value]) => `${type}:${fingerprint(String(value))}`);
    const limits = dimensions.map(([, , limit]) => Number(limit));
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_ai_quota_internal", {
      p_keys: keys,
      p_limits: limits,
      p_window_seconds: windowSeconds,
    });
    if (error || !data) return { allowed: false, retryAfter: 60, code: "ai_quota_unavailable" };
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.allowed === true) return { allowed: true };
    if (row?.allowed !== false || !Number.isFinite(Number(row.retry_after_seconds))) {
      return { allowed: false, retryAfter: 60, code: "ai_quota_unavailable" };
    }
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.min(Number(row?.retry_after_seconds) || 60, windowSeconds)),
      code: "ai_quota_exceeded",
    };
  } catch {
    // Missing migration/configuration must never turn into unlimited AI.
    return { allowed: false, retryAfter: 60, code: "ai_quota_unavailable" };
  }
}
