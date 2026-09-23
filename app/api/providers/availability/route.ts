import { NextResponse } from "next/server";
import { AiInputError } from "@/lib/ai-boundary/validation";
import { getProviderDefs, resolveProviderAvailability } from "@/lib/property-facts/providers/registry";
import type { PropertyRegion } from "@/lib/property-facts/types";
import {
  COUNTRY_PARAM,
  propertyApiErrorSync,
  requestIdFrom,
  withRequestHeaders,
} from "@/lib/property-domain/http";

export const runtime = "nodejs";

/**
 * GET /api/providers/availability?country=US
 * No generate quota; secrets never exposed.
 */
export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const url = new URL(request.url);
    const country = (url.searchParams.get("country") ?? "").toUpperCase();
    if (!COUNTRY_PARAM.has(country)) {
      throw new AiInputError("country_invalid");
    }
    const region = country as PropertyRegion;
    const checkedAt = new Date().toISOString();

    const providers = getProviderDefs().map((def) => {
      const availability = resolveProviderAvailability(def.id, region);
      return {
        id: def.id,
        kind: def.kind,
        label: def.label,
        available: availability?.available === true,
        reason: availability?.available ? null : (availability?.reason ?? "invalid_config"),
        lanes: def.lanes,
        complianceTags: def.complianceTags,
        humanVerificationRequired: def.humanVerificationRequired,
        rateLimit: def.rateLimit,
        allowsScraping: false as const,
      };
    });

    return withRequestHeaders(
      NextResponse.json({ country: region, checkedAt, providers }),
      requestId,
    );
  } catch (error) {
    return propertyApiErrorSync(error, requestId);
  }
}
