import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  AI_GUEST_COOKIE,
  createGuestIdentityCookie,
  guestCookieOptions,
  verifyGuestIdentityCookie,
} from "./guest-identity";
import { getAccountTier } from "@/lib/entitlement/tier";
import { createAdminClient } from "@/utils/supabase/admin";
import { consumeAiQuota, type AiQuotaTier } from "./quota";
import { AiInputError, type AiConsentAssertion } from "./validation";

export type AiBoundaryContext = {
  identityKind: "guest" | "user";
  tier: AiQuotaTier;
  /** Signed-in user id, or null for a guest cookie. */
  userId: string | null;
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

  let tier: AiQuotaTier = "guest";
  if (userId) {
    try {
      tier = await getAccountTier(createAdminClient(), userId);
    } catch {
      tier = "free";
    }
  }

  if (options?.consumeQuota !== false) {
    const quota = await consumeAiQuota(
      request,
      userId ? { kind: "user", userId, tier: tier === "pro" ? "pro" : "free" } : { kind: "guest", guest },
    );
    if (!quota.allowed) {
      const status = quota.code === "ai_quota_exceeded" ? 429 : 503;
      const error = new AiInputError(quota.code, status);
      if (quota.code === "ai_quota_exceeded") {
        Object.assign(error, {
          tier: quota.tier,
          limit: quota.limit,
          resetsAt: quota.resetsAt,
          retryAfter: quota.retryAfter,
        });
      } else {
        Object.assign(error, { retryAfter: quota.retryAfter });
      }
      throw error;
    }
    if (quota.allowed) tier = quota.tier;
  }

  return {
    identityKind: actualKind,
    tier,
    userId,
    applyCookie(response) {
      if (issued) {
        response.cookies.set(AI_GUEST_COOKIE, issued.value, guestCookieOptions(issued.maxAge));
      }
      return response;
    },
  };
}

export function aiErrorResponse(error: unknown): NextResponse {
  if (error instanceof AiInputError) {
    const extra = error as AiInputError & {
      retryAfter?: number | null;
      tier?: string;
      limit?: string;
      resetsAt?: string | null;
    };
    const retryAfter = extra.retryAfter;
    return NextResponse.json(
      {
        error: "AI request could not be completed.",
        code: error.code,
        ...(error.status === 429
          ? { tier: extra.tier ?? null, limit: extra.limit ?? null, resetsAt: extra.resetsAt ?? null }
          : {}),
      },
      {
        status: error.status,
        headers:
          typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter > 0
            ? { "Retry-After": String(Math.ceil(retryAfter)) }
            : undefined,
      },
    );
  }
  const timedOut =
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError" || /timed?\s*out/i.test(error.message));
  return NextResponse.json(
    {
      error: "AI request could not be completed.",
      code: timedOut ? "ai_upstream_timeout" : "ai_upstream_failed",
    },
    { status: timedOut ? 504 : 502 },
  );
}
