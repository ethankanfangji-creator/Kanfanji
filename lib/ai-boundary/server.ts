import { NextResponse } from "next/server";
import { limitFor, resolveAiTier, type AiTier } from "@/lib/ai-quota";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import {
  AI_GUEST_COOKIE,
  createGuestIdentityCookie,
  guestCookieOptions,
  verifyGuestIdentityCookie,
} from "./guest-identity";
import { consumeAiQuota } from "./quota";
import { AiInputError, type AiConsentAssertion } from "./validation";

export type AiBoundaryContext = {
  identityKind: "guest" | "user";
  tier: AiTier;
  applyCookie<T>(response: NextResponse<T>): NextResponse<T>;
};

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}

async function authenticatedUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/** Server-side subscription status for this user only. Never trust client isPro. */
async function subscriptionStatusFor(userId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("subscriptions")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    return typeof data?.status === "string" ? data.status : null;
  } catch {
    return null;
  }
}

export async function authorizeAiRequest(
  request: Request,
  assertion: AiConsentAssertion,
  options?: { consumeQuota?: boolean },
): Promise<AiBoundaryContext> {
  const userId = await authenticatedUserId();
  const verified = verifyGuestIdentityCookie(cookieValue(request, AI_GUEST_COOKIE));
  const issued = verified ? null : createGuestIdentityCookie();
  const guest = verified ?? issued?.identity ?? null;
  if (!guest) throw new AiInputError("ai_identity_unavailable", 503);

  const actualKind = userId ? "user" : "guest";
  if (assertion.identityKind !== actualKind) {
    throw new AiInputError("ai_identity_mismatch", 401);
  }

  const subscriptionStatus = userId ? await subscriptionStatusFor(userId) : null;
  const tier = resolveAiTier({ userId, subscriptionStatus });

  if (options?.consumeQuota !== false) {
    const quota = await consumeAiQuota(
      request,
      userId
        ? {
            kind: "user",
            userId,
            deviceId: guest.deviceId,
            // Authenticated subjects are never guest-tier.
            tier: tier === "pro" ? "pro" : "free",
          }
        : { kind: "guest", guest, tier: "guest" },
    );
    if (!quota.allowed) {
      const error = new AiInputError(quota.code, quota.code === "ai_quota_exceeded" ? 429 : 503);
      Object.assign(error, {
        retryAfter: quota.retryAfter,
        tier: quota.tier,
        limit: quota.limit,
        resetAt: quota.resetAt,
      });
      throw error;
    }
  }

  return {
    identityKind: actualKind,
    tier,
    applyCookie(response) {
      if (issued) {
        response.cookies.set(AI_GUEST_COOKIE, issued.value, guestCookieOptions(issued.maxAge));
      }
      return response;
    },
  };
}

type QuotaErrorFields = {
  retryAfter?: number;
  tier?: AiTier;
  limit?: number;
  resetAt?: string;
};

export function aiErrorResponse(error: unknown): NextResponse {
  if (error instanceof AiInputError) {
    const extra = error as AiInputError & QuotaErrorFields;
    const retryAfter = Number(extra.retryAfter);
    const body: Record<string, unknown> = {
      error: "AI request could not be completed.",
      code: error.code,
    };
    if (extra.tier) body.tier = extra.tier;
    if (typeof extra.limit === "number") body.limit = extra.limit;
    else if (extra.tier) body.limit = limitFor(extra.tier);
    if (typeof extra.resetAt === "string") body.resetAt = extra.resetAt;
    return NextResponse.json(body, {
      status: error.status,
      headers:
        Number.isFinite(retryAfter) && retryAfter > 0
          ? { "Retry-After": String(Math.ceil(retryAfter)) }
          : undefined,
    });
  }
  const timedOut =
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      /timed?\s*out/i.test(error.message));
  return NextResponse.json(
    {
      error: "AI request could not be completed.",
      code: timedOut ? "ai_upstream_timeout" : "ai_upstream_failed",
    },
    { status: timedOut ? 504 : 502 },
  );
}
