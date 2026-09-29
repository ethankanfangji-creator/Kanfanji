import { createHmac } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import type { GuestIdentity } from "./guest-identity";
import { proWeekWindow } from "./quota-window";

export type AiQuotaTier = "guest" | "free" | "pro";

type QuotaIdentity =
  | { kind: "guest"; guest: GuestIdentity }
  | { kind: "user"; userId: string; tier: "free" | "pro" };

export type QuotaResult =
  | { allowed: true; tier: AiQuotaTier }
  | {
      allowed: false;
      code: "ai_quota_exceeded";
      tier: AiQuotaTier;
      limit: "tier" | "network";
      retryAfter: number | null;
      resetsAt: string | null;
    }
  | { allowed: false; code: "ai_quota_unavailable"; retryAfter: 60 };

function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) ? Math.max(1, Math.min(value, 10_000)) : fallback;
}

export function intelKeyFingerprint(raw: string): string {
  return fingerprint(raw);
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

export function aiQuotaKeysForUser(userId: string, now = new Date()) {
  const week = proWeekWindow(now);
  return {
    free: `free_l:${fingerprint(userId)}`,
    proWeek: `pro_w:${fingerprint(userId)}:${week.weekKey}`,
    weekKey: week.weekKey,
  };
}

export function aiQuotaKeyForGuest(guestId: string): string {
  return `guest_l:${fingerprint(guestId)}`;
}

function dimensions(request: Request, identity: QuotaIdentity, now: Date) {
  const ip = clientIp(request);
  if (identity.kind === "guest") {
    return {
      tier: "guest" as const,
      keys: [aiQuotaKeyForGuest(identity.guest.guestId), `ip:guest:${fingerprint(ip)}`],
      limits: [
        envLimit("AI_GUEST_LIFETIME_LIMIT", 30),
        envLimit("AI_GUEST_IP_DAILY_LIMIT", 60),
      ],
      windows: [0, 86_400],
    };
  }
  const keys = aiQuotaKeysForUser(identity.userId, now);
  if (identity.tier === "pro") {
    return {
      tier: "pro" as const,
      keys: [keys.proWeek, `ip:user:${fingerprint(ip)}`],
      limits: [envLimit("AI_PRO_WEEKLY_LIMIT", 200), envLimit("AI_USER_IP_DAILY_LIMIT", 300)],
      windows: [0, 86_400],
    };
  }
  return {
    tier: "free" as const,
    keys: [keys.free, `ip:user:${fingerprint(ip)}`],
    limits: [envLimit("AI_FREE_LIFETIME_LIMIT", 100), envLimit("AI_USER_IP_DAILY_LIMIT", 300)],
    windows: [0, 86_400],
  };
}

export async function consumeAiQuota(
  request: Request,
  identity: QuotaIdentity,
  now = new Date(),
): Promise<QuotaResult> {
  try {
    const plan = dimensions(request, identity, now);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_ai_quota_v2", {
      p_keys: plan.keys,
      p_limits: plan.limits,
      p_window_seconds: plan.windows,
    });
    if (error || !data) return { allowed: false, code: "ai_quota_unavailable", retryAfter: 60 };
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.allowed === true) return { allowed: true, tier: plan.tier };
    if (row?.allowed !== false) return { allowed: false, code: "ai_quota_unavailable", retryAfter: 60 };
    const blocked = Number(row.blocked_index);
    if (blocked === 2) {
      const retry = Number(row.retry_after_seconds);
      return {
        allowed: false,
        code: "ai_quota_exceeded",
        tier: plan.tier,
        limit: "network",
        retryAfter: Number.isFinite(retry) ? Math.max(1, retry) : 86_400,
        resetsAt: null,
      };
    }
    if (blocked !== 1) return { allowed: false, code: "ai_quota_unavailable", retryAfter: 60 };
    if (plan.tier === "pro") {
      const resetsAt = proWeekWindow(now).resetsAt;
      return {
        allowed: false,
        code: "ai_quota_exceeded",
        tier: "pro",
        limit: "tier",
        retryAfter: Math.max(1, Math.ceil((resetsAt.getTime() - now.getTime()) / 1000)),
        resetsAt: resetsAt.toISOString(),
      };
    }
    return {
      allowed: false,
      code: "ai_quota_exceeded",
      tier: plan.tier,
      limit: "tier",
      retryAfter: null,
      resetsAt: null,
    };
  } catch {
    return { allowed: false, code: "ai_quota_unavailable", retryAfter: 60 };
  }
}
