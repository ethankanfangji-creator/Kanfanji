import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  assertContentLength,
  authorizeAiRequest,
  validateConsent,
} from "@/lib/ai-boundary/server-entry";
import { AI_LIMITS } from "@/lib/ai-boundary/config";
import { assemblePropertyFacts } from "@/lib/property-facts/orchestrator";
import { projectFactCardToIntel } from "@/lib/property-facts/project";
import { projectFactCardToReport } from "@/lib/property-facts/report";
import { buildStreetViewUrl } from "@/lib/property-intel/street-view";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const body = (await request.json()) as Record<string, unknown>;
    const consent = validateConsent((key) => body[key]);
    const boundary = await authorizeAiRequest(request, consent);

    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!address || address.length > 500) throw new AiInputError("address_invalid");
    const viewingId =
      typeof body.viewingId === "string" && body.viewingId.trim()
        ? body.viewingId.trim()
        : null;
    if (viewingId && viewingId.length > AI_LIMITS.genericString) {
      throw new AiInputError("viewing_invalid");
    }

    const includeFactCard = body.includeFactCard !== false;
    const card = await assemblePropertyFacts({ address });
    const intel = projectFactCardToIntel(card);
    const report = projectFactCardToReport(card);
    const lat = intel.location.lat;
    const lng = intel.location.lng;
    if (lat != null && lng != null) {
      intel.visuals.streetViewUrl = buildStreetViewUrl(lat, lng);
      if (intel.visuals.streetViewUrl) {
        intel.sources = [...new Set([...intel.sources, "Google Street View"])];
        intel.compliance.streetViewNotice = true;
      }
    }

    if (viewingId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase
          .from("viewings")
          .update({
            metadata: {
              intel,
              factCard: includeFactCard ? card : undefined,
              propertyReport: report,
            },
            updated_at: new Date().toISOString(),
            client_updated_at: new Date().toISOString(),
          })
          .eq("id", viewingId)
          .eq("user_id", user.id);
        if (error) {
          console.error("property_intel_persist", error.message);
        }
      }
    }

    return boundary.applyCookie(
      NextResponse.json({
        intel,
        report,
        ...(includeFactCard ? { factCard: card } : {}),
      }),
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
