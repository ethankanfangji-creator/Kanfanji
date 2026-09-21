import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  assertContentLength,
  authorizeAiRequest,
  validateConsent,
} from "@/lib/ai-boundary/server-entry";
import { assemblePropertyFacts } from "@/lib/property-facts/orchestrator";
import { factCardPromptPayload } from "@/lib/property-facts/project";
import { projectFactCardToReport } from "@/lib/property-facts/report";

export const runtime = "nodejs";

/**
 * Property facts JSON — provenance-first card for US / CA / TW.
 * Returns factCard (internal provenance) + report (external DTO) + promptPayload.
 */
export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const body = (await request.json()) as Record<string, unknown>;
    const consent = validateConsent((key) => body[key]);
    const boundary = await authorizeAiRequest(request, consent);

    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!address || address.length > 500) throw new AiInputError("address_invalid");

    const bypassCache = body.bypassCache === true;
    const card = await assemblePropertyFacts({ address, bypassCache });
    const report = projectFactCardToReport(card);

    return boundary.applyCookie(
      NextResponse.json({
        factCard: card,
        report,
        promptPayload: factCardPromptPayload(card),
      }),
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
