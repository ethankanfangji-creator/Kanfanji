/**
 * Shared helpers for property-report / evidence / providers HTTP routes.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  AiInputError,
  type AiConsentAssertion,
  validateConsent,
} from "@/lib/ai-boundary/validation";
import { authorizeAiRequest } from "@/lib/ai-boundary/server";
import type { AiBoundaryContext } from "@/lib/ai-boundary/server";

export function requestIdFrom(request: Request): string {
  const incoming = request.headers.get("x-request-id")?.trim();
  if (incoming && incoming.length <= 128) return incoming;
  return randomUUID();
}

export function withRequestHeaders(
  response: NextResponse,
  requestId: string,
  extra?: HeadersInit,
): NextResponse {
  response.headers.set("x-request-id", requestId);
  if (extra) {
    const h = new Headers(extra);
    h.forEach((v, k) => response.headers.set(k, v));
  }
  return response;
}

export function consentFromRequest(
  request: Request,
  body?: Record<string, unknown>,
): AiConsentAssertion {
  const get = (key: string): unknown => {
    if (body && body[key] != null) return body[key];
    const headerKey = `x-ai-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
    // consentVersion → x-ai-consent-version
    const headerMap: Record<string, string> = {
      consentVersion: "x-ai-consent-version",
      consentSessionId: "x-ai-consent-session-id",
      identityKind: "x-ai-identity-kind",
    };
    const header = request.headers.get(headerMap[key] ?? headerKey);
    if (header != null) return header;
    const url = new URL(request.url);
    return url.searchParams.get(key);
  };
  return validateConsent(get);
}

export async function authorizePropertyApi(
  request: Request,
  body: Record<string, unknown> | undefined,
  opts?: { consumeQuota?: boolean },
): Promise<AiBoundaryContext> {
  const consent = consentFromRequest(request, body);
  return authorizeAiRequest(request, consent, {
    consumeQuota: opts?.consumeQuota !== false,
  });
}

export function propertyApiErrorSync(error: unknown, requestId: string): NextResponse {
  if (error instanceof AiInputError) {
    const retryAfter = Number((error as AiInputError & { retryAfter?: number }).retryAfter);
    const retryable = error.status === 429 || error.status === 503;
    return withRequestHeaders(
      NextResponse.json(
        {
          error: "AI request could not be completed.",
          code: error.code,
          request_id: requestId,
          retryable,
        },
        {
          status: error.status,
          headers:
            Number.isFinite(retryAfter) && retryAfter > 0
              ? { "Retry-After": String(Math.ceil(retryAfter)) }
              : undefined,
        },
      ),
      requestId,
    );
  }
  const timedOut =
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      /timed?\s*out/i.test(error.message));
  return withRequestHeaders(
    NextResponse.json(
      {
        error: "AI request could not be completed.",
        code: timedOut ? "ai_upstream_timeout" : "ai_upstream_failed",
        request_id: requestId,
        retryable: true,
      },
      { status: timedOut ? 504 : 502 },
    ),
    requestId,
  );
}

export const COUNTRY_PARAM = new Set(["US", "CA", "TW", "OTHER"]);
