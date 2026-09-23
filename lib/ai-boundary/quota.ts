import { createHmac } from "node:crypto";
import {
  AI_QUOTA_EXCEEDED_CODE,
  AI_SECONDARY_DAILY_LIMITS,
  limitFor,
  resetAtFromRetryAfter,
  type AiTier,
} from "@/lib/ai-quota";
import { createAdminClient } from "@/utils/supabase/admin";
import type { GuestIdentity } from "./guest-identity";

type QuotaIdentity =
  | { kind: "guest"; guest: GuestIdentity; tier: "guest" }
  | { kind: "user"; userId: string; deviceId: string; tier: Exclude<AiTier, "guest"> };

export type QuotaResult =
  | { allowed: true; tier: AiTier; limit: number }
  | {
      allowed: false;
      retryAfter: number;
      code: typeof AI_QUOTA_EXCEEDED_CODE | "ai_quota_unavailable";
      tier: AiTier;
      limit: number;
      resetAt: string;
    };

function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) ? Math.max(1, Math.min(value, 10_000)) : fallback;
}

function fingerprint(value: string): string {
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
  const tier = identity.tier;
  const subjectLimit = limitFor(tier);
  try {
    const windowSeconds = envLimit("AI_QUOTA_WINDOW_SECONDS", 86_400);
    const deviceLimit = envLimit("AI_DEVICE_DAILY_LIMIT", AI_SECONDARY_DAILY_LIMITS.device);
    const ipLimit = envLimit("AI_IP_DAILY_LIMIT", AI_SECONDARY_DAILY_LIMITS.ip);
    const dimensions =
      identity.kind === "guest"
        ? [
            ["guest", identity.guest.guestId, subjectLimit],
            ["device", identity.guest.deviceId, deviceLimit],
            ["ip", clientIp(request), ipLimit],
          ]
        : [
            ["user", identity.userId, subjectLimit],
            ["device", identity.deviceId, deviceLimit],
            ["ip", clientIp(request), ipLimit],
          ];
    const keys = dimensions.map(([type, value]) => `${type}:${fingerprint(String(value))}`);
    const limits = dimensions.map(([, , limit]) => Number(limit));
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_ai_quota_internal", {
      p_keys: keys,
      p_limits: limits,
      p_window_seconds: windowSeconds,
    });
    if (error || !data) {
      return {
        allowed: false,
        retryAfter: 60,
        code: "ai_quota_unavailable",
        tier,
        limit: subjectLimit,
        resetAt: resetAtFromRetryAfter(60),
      };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.allowed === true) return { allowed: true, tier, limit: subjectLimit };
    if (row?.allowed !== false || !Number.isFinite(Number(row.retry_after_seconds))) {
      return {
        allowed: false,
        retryAfter: 60,
        code: "ai_quota_unavailable",
        tier,
        limit: subjectLimit,
        resetAt: resetAtFromRetryAfter(60),
      };
    }
    const retryAfter = Math.max(1, Math.min(Number(row?.retry_after_seconds) || 60, windowSeconds));
    return {
      allowed: false,
      retryAfter,
      code: AI_QUOTA_EXCEEDED_CODE,
      tier,
      limit: subjectLimit,
      resetAt: resetAtFromRetryAfter(retryAfter),
    };
  } catch {
    // Missing migration/configuration must never turn into unlimited AI.
    return {
      allowed: false,
      retryAfter: 60,
      code: "ai_quota_unavailable",
      tier,
      limit: subjectLimit,
      resetAt: resetAtFromRetryAfter(60),
    };
  }
}
