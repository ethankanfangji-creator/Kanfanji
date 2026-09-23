import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  assertContentLength,
  authorizeAiRequest,
  validateConsent,
} from "@/lib/ai-boundary/server-entry";
import { factCardPromptPayload } from "@/lib/property-facts/project";
import { createPropertyReportApi } from "@/lib/property-domain/create-report-api";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * Thin alias of POST /api/property-report (legacy shape + reportId).
 * Prefer /api/property-report for new clients.
 */
export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const body = (await request.json()) as Record<string, unknown>;
    const consent = validateConsent((key) => body[key]);
    const boundary = await authorizeAiRequest(request, consent);

    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!address || address.length > 500) throw new AiInputError("address_invalid");

    const includeFactCard = body.includeFactCard !== false;
    const result = await createPropertyReportApi(address, {
      bypassCache: body.bypassCache === true,
      includeMarkdown: body.includeMarkdown !== false,
      includeLegacyReport: true,
      includeDomainReport: true,
      includeFactCard,
    });

    const factCard =
      result.body.factCard ??
      result.generated?.factCard ??
      null;

    return boundary.applyCookie(
      NextResponse.json({
        reportId: result.body.reportId,
        cache: result.body.cache,
        links: result.body.links,
        factCard,
        report: result.body.report,
        domainReport: result.body.domainReport,
        markdown: result.body.markdown,
        stages: result.body.stages,
        promptPayload: factCard ? factCardPromptPayload(factCard as never) : null,
      }),
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
