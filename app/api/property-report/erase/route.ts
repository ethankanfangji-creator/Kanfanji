import { NextResponse } from "next/server";
import { assertContentLength } from "@/lib/ai-boundary/server-entry";
import { AiInputError } from "@/lib/ai-boundary/validation";
import { erasePropertyData } from "@/lib/property-domain/erasure";
import {
  authorizePropertyApi,
  propertyApiErrorSync,
  requestIdFrom,
  withRequestHeaders,
} from "@/lib/property-domain/http";

export const runtime = "nodejs";

/**
 * POST /api/property-report/erase
 * Body: { reportId? | address? | cacheKey?, ...consent }
 */
export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    assertContentLength(request);
    const body = (await request.json()) as Record<string, unknown>;
    const boundary = await authorizePropertyApi(request, body, { consumeQuota: true });

    const reportId =
      typeof body.reportId === "string" && body.reportId.trim()
        ? body.reportId.trim()
        : undefined;
    const address =
      typeof body.address === "string" && body.address.trim()
        ? body.address.trim()
        : undefined;
    const cacheKey =
      typeof body.cacheKey === "string" && body.cacheKey.trim()
        ? body.cacheKey.trim()
        : undefined;

    if (!reportId && !address && !cacheKey) {
      throw new AiInputError("erase_target_required");
    }
    if (reportId && reportId.length > 80) throw new AiInputError("report_not_found", 404);
    if (address && address.length > 500) throw new AiInputError("address_invalid");

    const result = await erasePropertyData({
      reportId,
      address,
      cacheKey,
      actor: boundary.identityKind === "user" ? "user" : "guest",
    });

    return boundary.applyCookie(
      withRequestHeaders(NextResponse.json({ ...result, request_id: requestId }), requestId),
    );
  } catch (error) {
    return propertyApiErrorSync(error, requestId);
  }
}
