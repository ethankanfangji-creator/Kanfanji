import { assemblePropertyFacts } from "@/lib/property-facts/orchestrator";
import { projectFactCardToIntel } from "@/lib/property-facts/project";
import { buildStreetViewUrl } from "./street-view";
import type { PropertyIntel } from "./types";

/**
 * Assemble property intelligence for an address.
 *
 * Delegates to the property-facts pipeline (Normalizer → Geocode → country lanes →
 * Evidence → Confidence/Conflict). LLM does not fill fact fields.
 *
 * Street View URL is attached after projection (visuals only).
 */
export async function buildPropertyIntel(input: {
  address: string;
  /** @deprecated Ignored — facts are never LLM-extracted from snippets. */
  openaiApiKey?: string | null;
  bypassCache?: boolean;
}): Promise<PropertyIntel> {
  const card = await assemblePropertyFacts({
    address: input.address,
    bypassCache: input.bypassCache,
  });

  const intel = projectFactCardToIntel(card);

  const lat = intel.location.lat;
  const lng = intel.location.lng;
  if (lat != null && lng != null) {
    intel.visuals.streetViewUrl = buildStreetViewUrl(lat, lng);
    if (intel.visuals.streetViewUrl) {
      intel.sources = [...new Set([...intel.sources, "Google Street View"])];
      intel.compliance.streetViewNotice = true;
    }
  }

  return intel;
}

/** Expose FactCard assembly for APIs that need provenance JSON. */
export { assemblePropertyFacts } from "@/lib/property-facts/orchestrator";
