import { NextResponse } from "next/server";
import { assertContentLength } from "@/lib/ai-boundary/server-entry";
import { AiInputError } from "@/lib/ai-boundary/validation";
import { createPropertyReportApi } from "@/lib/property-domain/create-report-api";
import {
  authorizePropertyApi,
  propertyApiErrorSync,
  requestIdFrom,
  withRequestHeaders,
} from "@/lib/property-domain/http";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * POST /api/property-report — generate, persist, return reportId + JSON/markdown.
 */
export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    assertContentLength(request);
    const body = (await request.json()) as Record<string, unknown>;
    const boundary = await authorizePropertyApi(request, body, { consumeQuota: true });

    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!address || address.length > 500) throw new AiInputError("address_invalid");

    const countryHint = body.countryHint;
    if (
      countryHint != null &&
      countryHint !== "US" &&
      countryHint !== "CA" &&
      countryHint !== "TW" &&
      countryHint !== "OTHER"
    ) {
      throw new AiInputError("country_invalid");
    }

    const result = await createPropertyReportApi(address, {
      bypassCache: body.bypassCache === true,
      includeMarkdown: body.includeMarkdown !== false,
      includeLegacyReport: body.includeLegacyReport !== false,
      includeDomainReport: body.includeDomainReport !== false,
      includeFactCard: body.includeFactCard === true,
      createdBy: boundary.userId,
      locale:
        body.locale === "zh-Hans" || body.locale === "en" || body.locale === "th"
          ? body.locale
          : "zh-Hant",
    });

    return boundary.applyCookie(
      withRequestHeaders(NextResponse.json(result.body), requestId),
    );
  } catch (error) {
    return propertyApiErrorSync(error, requestId);
  }
}
