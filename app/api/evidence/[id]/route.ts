import { NextResponse } from "next/server";
import { AiInputError } from "@/lib/ai-boundary/validation";
import {
  authorizePropertyApi,
  propertyApiErrorSync,
  requestIdFrom,
  withRequestHeaders,
} from "@/lib/property-domain/http";
import { getEvidenceByReport, getReportById } from "@/lib/property-domain/persist-report";

export const runtime = "nodejs";

/**
 * GET /api/evidence/:id?reportId=…
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const boundary = await authorizePropertyApi(request, undefined, {
      consumeQuota: false,
    });

    const { id: evidenceId } = await context.params;
    const url = new URL(request.url);
    const reportId = url.searchParams.get("reportId")?.trim() ?? "";

    if (!reportId || reportId.length > 80) {
      throw new AiInputError("report_not_found", 404);
    }
    if (!evidenceId || evidenceId.length > 200) {
      throw new AiInputError("evidence_not_found", 404);
    }

    const report = await getReportById(reportId);
    if (!report) throw new AiInputError("report_not_found", 404);

    const evidence = await getEvidenceByReport(reportId, evidenceId);
    if (!evidence) throw new AiInputError("evidence_not_found", 404);

    return boundary.applyCookie(
      withRequestHeaders(
        NextResponse.json({ reportId, evidence }),
        requestId,
      ),
    );
  } catch (error) {
    return propertyApiErrorSync(error, requestId);
  }
}
