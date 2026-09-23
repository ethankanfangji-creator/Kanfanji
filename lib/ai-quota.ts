/**
 * AI daily quota tiers aligned with Stripe entitlement.
 *
 * Scope: one shared counter across all AI routes that call `authorizeAiRequest`
 * (process-recording, vision, property-source/ingest, viewing-chat, etc.).
 *
 * Day boundary: rolling window of `AI_QUOTA_WINDOW_SECONDS` (default 86_400).
 * Timestamps are timestamptz (UTC). Not calendar midnight in America/Vancouver.
 * `resetAt` ≈ now + retry_after_seconds when the window is exhausted.
 *
 * Counting: reserve/increment in `consume_ai_quota_internal` after identity +
 * consent checks and before OpenAI. Upstream failures do not refund (simple).
 *
 * Entitlement: Pro only from DB `subscriptions.status` via
 * `isActiveSubscriptionStatus`. Never trust client `isPro`.
 */

import { isActiveSubscriptionStatus } from "@/lib/billing-status";

export const AI_TIERS = ["guest", "free", "pro"] as const;
export type AiTier = (typeof AI_TIERS)[number];

/** Default daily limits per subject (user or guest). Env can override. */
export const AI_DAILY_LIMITS = {
  guest: 5,
  free: 20,
  pro: 200,
} as const satisfies Record<AiTier, number>;

/** Secondary caps (anti-abuse); apply on top of the subject-tier limit. */
export const AI_SECONDARY_DAILY_LIMITS = {
  device: 40,
  ip: 60,
} as const;

export const AI_QUOTA_EXCEEDED_CODE = "ai_quota_exceeded" as const;

function envOverride(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) ? Math.max(1, Math.min(value, 10_000)) : fallback;
}

/**
 * Resolve quota tier from auth + subscription row.
 * `subscriptionStatus` must come from the server DB for this user id.
 */
export function resolveAiTier(input: {
  userId?: string | null;
  subscriptionStatus?: string | null;
  /** Ignored if present — client claims must never grant Pro. */
  clientIsPro?: boolean;
}): AiTier {
  void input.clientIsPro;
  if (!input.userId) return "guest";
  if (isActiveSubscriptionStatus(input.subscriptionStatus)) return "pro";
  return "free";
}

export function limitFor(tier: AiTier): number {
  switch (tier) {
    case "guest":
      return envOverride("AI_GUEST_DAILY_LIMIT", AI_DAILY_LIMITS.guest);
    case "free":
      return envOverride("AI_FREE_DAILY_LIMIT", AI_DAILY_LIMITS.free);
    case "pro":
      return envOverride("AI_PRO_DAILY_LIMIT", AI_DAILY_LIMITS.pro);
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

/** True when consuming one more unit would exceed the limit. */
export function wouldExceed(count: number, limit: number): boolean {
  if (!Number.isFinite(count) || !Number.isFinite(limit) || limit < 1) return true;
  return count >= limit;
}

export function resetAtFromRetryAfter(retryAfterSeconds: number, now = Date.now()): string {
  const secs = Math.max(1, Math.ceil(retryAfterSeconds));
  return new Date(now + secs * 1000).toISOString();
}
