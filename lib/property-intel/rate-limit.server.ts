import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { intelKeyFingerprint } from "@/lib/ai-boundary/quota";

export type IntelIdentity = {
  userId: string | null;
  guestId: string | null;
};

export type IntelRateLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; code: "intel_rate_limited" | "intel_unavailable" };

function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) ? Math.max(1, Math.min(value, 10_000)) : fallback;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** HMAC keys only. Distinct guest and signed-in prefixes so limits do not share a counter. */
export function intelQuotaPlan(identity: IntelIdentity, ip: string) {
  if (identity.userId) {
    return {
      keys: [
        `intel:u:${intelKeyFingerprint(identity.userId)}`,
        `intel:ip:u:${intelKeyFingerprint(ip)}`,
      ],
      limits: [
        envLimit("INTEL_USER_DAILY_LIMIT", 100),
        envLimit("INTEL_USER_IP_DAILY_LIMIT", 300),
      ],
    };
  }
  return {
    keys: [
      `intel:g:${intelKeyFingerprint(identity.guestId ?? "")}`,
      `intel:ip:g:${intelKeyFingerprint(ip)}`,
    ],
    limits: [
      envLimit("INTEL_GUEST_DAILY_LIMIT", 30),
      envLimit("INTEL_GUEST_IP_DAILY_LIMIT", 100),
    ],
  };
}

export async function consumeIntelRateLimit(
  request: Request,
  identity: IntelIdentity,
): Promise<IntelRateLimitResult> {
  if (!identity.userId && !identity.guestId) {
    return { allowed: false, status: 503, code: "intel_unavailable" };
  }
  try {
    const plan = intelQuotaPlan(identity, clientIp(request));
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_ai_quota_internal", {
      p_keys: plan.keys,
      p_limits: plan.limits,
      p_window_seconds: 86_400,
    });
    if (error || !data) return { allowed: false, status: 503, code: "intel_unavailable" };
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.allowed === true) return { allowed: true };
    if (row?.allowed === false) {
      return { allowed: false, status: 429, code: "intel_rate_limited" };
    }
    return { allowed: false, status: 503, code: "intel_unavailable" };
  } catch {
    return { allowed: false, status: 503, code: "intel_unavailable" };
  }
}
