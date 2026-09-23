import { NextResponse } from "next/server";
import { AiInputError } from "@/lib/ai-boundary/validation";
import {
  authorizePropertyApi,
  propertyApiErrorSync,
  requestIdFrom,
  withRequestHeaders,
} from "@/lib/property-domain/http";
import { getReportById, toApiResponseBody } from "@/lib/property-domain/persist-report";

export const runtime = "nodejs";

/**
 * GET /api/property-report/:id
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

    const { id } = await context.params;
    if (!id || id.length > 80) throw new AiInputError("report_not_found", 404);

    const url = new URL(request.url);
    const includeMarkdown = url.searchParams.get("includeMarkdown") !== "false";
    const includeLegacyReport = url.searchParams.get("includeLegacyReport") !== "false";
    const includeDomainReport = url.searchParams.get("includeDomainReport") !== "false";

    const persisted = await getReportById(id);
    if (!persisted) throw new AiInputError("report_not_found", 404);

    const body = toApiResponseBody(persisted, {
      includeMarkdown,
      includeLegacyReport,
      includeDomainReport,
      factCard: null,
    });

    const etag = `"${persisted.cache.expiresAt}"`;
    if (request.headers.get("if-none-match") === etag) {
      return boundary.applyCookie(
        withRequestHeaders(new NextResponse(null, { status: 304 }), requestId, {
          ETag: etag,
        }),
      );
    }

    return boundary.applyCookie(
      withRequestHeaders(NextResponse.json(body), requestId, { ETag: etag }),
    );
  } catch (error) {
    return propertyApiErrorSync(error, requestId);
  }
}
