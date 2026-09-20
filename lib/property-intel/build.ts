import { lookupAddressDetails } from "@/lib/address-lookup";
import { searchPropertySnippets } from "./bing-search";
import { extractFromSnippetsRegex, extractFromSnippetsWithAi } from "./extract";
import { enrichGooglePlaces, geocodeWithGoogle } from "./google-places";
import {
  buildRiskTags,
  detectStrata,
  emptyIntel,
  guessNoiseNote,
  type PropertyIntel,
} from "./types";

function pickString(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickNum(...vals: Array<number | null | undefined>): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * Assemble property intelligence for an address.
 * BC Geocoder / Metro Open Data → coords + PID; Google Places → nearby;
 * Bing snippets → year / sale / strata (no crawling).
 */
export async function buildPropertyIntel(input: {
  address: string;
  openaiApiKey?: string | null;
}): Promise<PropertyIntel> {
  const address = input.address.trim();
  const intel = emptyIntel(address);
  const sources: string[] = [];

  // a) BC Geocoder + Metro Open Data
  try {
    const lookup = await lookupAddressDetails(address);
    intel.address = lookup.displayAddress || address;
    intel.basic.pid = lookup.details.openData?.pid ?? null;
    intel.location.lat = lookup.details.lat ?? null;
    intel.location.lng = lookup.details.lng ?? null;
    sources.push(lookup.source);
    if (lookup.details.openData?.source) sources.push(lookup.details.openData.source);
  } catch {
    // continue with Google geocode fallback
  }

  if (intel.location.lat == null || intel.location.lng == null) {
    const g = await geocodeWithGoogle(address);
    if (g) {
      intel.location.lat = g.lat;
      intel.location.lng = g.lng;
      sources.push("Google Geocoding");
    }
  }

  // b) Google Places nearby
  if (intel.location.lat != null && intel.location.lng != null) {
    const places = await enrichGooglePlaces(intel.location.lat, intel.location.lng);
    intel.location = {
      ...intel.location,
      skytrain: places.location.skytrain ?? intel.location.skytrain,
      schools: places.location.schools?.length
        ? places.location.schools
        : intel.location.schools,
      supermarket: places.location.supermarket ?? intel.location.supermarket,
      park: places.location.park ?? intel.location.park,
    };
    sources.push(...places.sources);
  }

  intel.location.noise = guessNoiseNote(intel.address);

  // c) Bing Search snippets → extract facts
  const { snippets, sources: bingSources } = await searchPropertySnippets(intel.address);
  sources.push(...bingSources);

  let extracted = extractFromSnippetsRegex(snippets);
  if (snippets.length > 0 && input.openaiApiKey) {
    try {
      extracted = await extractFromSnippetsWithAi(
        intel.address,
        snippets,
        input.openaiApiKey,
      );
    } catch {
      // keep regex fallback
    }
  }

  intel.basic.year = pickNum(extracted.basic.year);
  intel.basic.type = pickString(extracted.basic.type);
  intel.basic.beds = pickNum(extracted.basic.beds);
  intel.basic.baths = pickNum(extracted.basic.baths);
  intel.basic.area = pickNum(extracted.basic.area);
  intel.history.last_sold = pickString(extracted.history.last_sold);
  intel.history.assessed = pickString(extracted.history.assessed);
  intel.history.strata = pickString(extracted.history.strata);

  // d) Risk tags from year / strata
  const isStrata = detectStrata(intel.basic.type, intel.history.strata);
  intel.risks = buildRiskTags(intel.basic.year, isStrata);
  intel.sources = [...new Set(sources.filter(Boolean))];
  intel.fetchedAt = new Date().toISOString();
  return intel;
}
