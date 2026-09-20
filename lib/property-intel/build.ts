import { lookupAddressDetails } from "@/lib/address-lookup";
import { getCachedPropertyIntel, setCachedPropertyIntel } from "./cache";
import { searchPropertySnippets } from "./bing-search";
import { extractFromSnippetsRegex, extractFromSnippetsWithAi } from "./extract";
import { enrichGooglePlaces, geocodeWithGoogle } from "./google-places";
import { enrichAttomProperty } from "./market-attom";
import {
  extractNeighborhoodFromSnippets,
  extractTwMarketFromSnippets,
} from "./neighborhood";
import { canonicalizeAddressQuery } from "./normalize-query";
import { enrichOsmOverpass } from "./osm-overpass";
import { buildStreetViewUrl } from "./street-view";
import {
  buildRiskTags,
  detectMarketRegion,
  detectStrata,
  emptyIntel,
  guessNoiseNote,
  looksLikeUnitLevelAddress,
  mergeAmenityLabel,
  type AmenityHit,
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

function mergeAmenities(
  primary: AmenityHit[] | undefined,
  fallback: AmenityHit[] | undefined,
): AmenityHit[] {
  const out: AmenityHit[] = [...(primary ?? [])];
  const seen = new Set(out.map((a) => `${a.kind}:${a.name}`));
  for (const hit of fallback ?? []) {
    const key = `${hit.kind}:${hit.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out.slice(0, 30);
}

/**
 * Assemble property intelligence for an address.
 *
 * Pipeline:
 * 0) Canonicalize query + DB cache hit (cost control)
 * 1) Geocode (BC / Google)
 * 2) Amenities (Google Places → OSM Overpass fill)
 * 3) Street View cover URL
 * 4) Market / listing facts (Bing snippets; optional ATTOM for US)
 * 5) Risk tags + compliance flags
 *
 * Never crawls listing sites — snippets + official APIs only.
 */
export async function buildPropertyIntel(input: {
  address: string;
  openaiApiKey?: string | null;
  /** Skip shared DB cache (tests / forced refresh) */
  bypassCache?: boolean;
}): Promise<PropertyIntel> {
  const rawAddress = input.address.trim();
  const query = canonicalizeAddressQuery(rawAddress) || rawAddress;

  if (!input.bypassCache) {
    const cached = await getCachedPropertyIntel(query);
    if (cached) return cached;
  }

  const intel = emptyIntel(rawAddress, query);
  const sources: string[] = [];
  const region = detectMarketRegion(query);
  intel.market.region = region;

  // 1) Geocode — prefer canonical query so 台/臺 & floors match open data
  try {
    const lookup = await lookupAddressDetails(query);
    intel.address = lookup.displayAddress || rawAddress;
    intel.basic.pid = lookup.details.openData?.pid ?? null;
    intel.location.lat = lookup.details.lat ?? null;
    intel.location.lng = lookup.details.lng ?? null;
    sources.push(lookup.source);
    if (lookup.details.openData?.source) sources.push(lookup.details.openData.source);
  } catch {
    // continue
  }

  if (intel.location.lat == null || intel.location.lng == null) {
    const g = await geocodeWithGoogle(query);
    if (g) {
      intel.location.lat = g.lat;
      intel.location.lng = g.lng;
      if (g.formattedAddress) intel.address = g.formattedAddress;
      sources.push("Google Geocoding");
    }
  }

  // 2) Amenities: Google first, OSM fill gaps
  const lat = intel.location.lat;
  const lng = intel.location.lng;
  if (lat != null && lng != null) {
    const [places, osm] = await Promise.all([
      enrichGooglePlaces(lat, lng),
      enrichOsmOverpass(lat, lng),
    ]);

    intel.location = {
      ...intel.location,
      skytrain: mergeAmenityLabel(
        places.location.skytrain ?? null,
        osm.location.skytrain ?? null,
      ),
      bus: mergeAmenityLabel(places.location.bus ?? null, osm.location.bus ?? null),
      schools:
        places.location.schools?.length
          ? places.location.schools
          : osm.location.schools ?? [],
      supermarket: mergeAmenityLabel(
        places.location.supermarket ?? null,
        osm.location.supermarket ?? null,
      ),
      park: mergeAmenityLabel(places.location.park ?? null, osm.location.park ?? null),
      hospital: mergeAmenityLabel(
        places.location.hospital ?? null,
        osm.location.hospital ?? null,
      ),
      amenities: mergeAmenities(places.location.amenities, osm.location.amenities),
    };
    sources.push(...places.sources, ...osm.sources);

    // 3) Street View cover
    intel.visuals.streetViewUrl = buildStreetViewUrl(lat, lng);
    if (intel.visuals.streetViewUrl) sources.push("Google Street View");
  }

  intel.location.noise = guessNoiseNote(intel.address);

  // 4a) Optional US ATTOM
  if (region === "US") {
    const attom = await enrichAttomProperty(intel.address);
    intel.basic.year = pickNum(attom.basic.year, intel.basic.year);
    intel.basic.type = pickString(attom.basic.type, intel.basic.type);
    intel.basic.beds = pickNum(attom.basic.beds, intel.basic.beds);
    intel.basic.baths = pickNum(attom.basic.baths, intel.basic.baths);
    intel.basic.area = pickNum(attom.basic.area, intel.basic.area);
    intel.history.last_sold = pickString(attom.history.last_sold, intel.history.last_sold);
    intel.history.assessed = pickString(attom.history.assessed, intel.history.assessed);
    intel.market = { ...intel.market, ...attom.market, region: "US" };
    sources.push(...attom.sources);
  }

  // 4b) Bing snippets (CA Assessment / TW 實價 / US listings) — no crawling
  const { snippets, sources: bingSources } = await searchPropertySnippets(
    query,
    region,
  );
  sources.push(...bingSources);

  let extracted = extractFromSnippetsRegex(snippets);
  if (snippets.length > 0 && input.openaiApiKey) {
    try {
      extracted = await extractFromSnippetsWithAi(query, snippets, input.openaiApiKey);
    } catch {
      // keep regex fallback
    }
  }

  intel.basic.year = pickNum(intel.basic.year, extracted.basic.year);
  intel.basic.type = pickString(intel.basic.type, extracted.basic.type);
  intel.basic.beds = pickNum(intel.basic.beds, extracted.basic.beds);
  intel.basic.baths = pickNum(intel.basic.baths, extracted.basic.baths);
  intel.basic.area = pickNum(intel.basic.area, extracted.basic.area);
  intel.history.last_sold = pickString(intel.history.last_sold, extracted.history.last_sold);
  intel.history.assessed = pickString(intel.history.assessed, extracted.history.assessed);
  intel.history.strata = pickString(intel.history.strata, extracted.history.strata);

  if (region === "TW") {
    const tw = extractTwMarketFromSnippets(snippets);
    intel.market = { ...intel.market, ...tw.market, region: "TW" };
    intel.neighborhood = {
      ...intel.neighborhood,
      name: tw.neighborhood.name ?? intel.neighborhood.name,
      builder: tw.neighborhood.builder ?? intel.neighborhood.builder,
      amenityRatio: tw.neighborhood.amenityRatio ?? intel.neighborhood.amenityRatio,
      notes: [
        ...intel.neighborhood.notes,
        ...(tw.neighborhood.notes ?? []),
      ].slice(0, 6),
    };
  } else {
    const nb = extractNeighborhoodFromSnippets(snippets);
    intel.neighborhood = {
      ...intel.neighborhood,
      builder: nb.builder ?? intel.neighborhood.builder,
      notes: [...intel.neighborhood.notes, ...(nb.notes ?? [])].slice(0, 6),
    };
  }

  // 5) Risks + compliance
  const isStrata = detectStrata(intel.basic.type, intel.history.strata);
  intel.risks = buildRiskTags(intel.basic.year, isStrata);
  intel.compliance = {
    streetViewNotice: Boolean(intel.visuals.streetViewUrl),
    unitLevelNotice:
      looksLikeUnitLevelAddress(rawAddress) ||
      looksLikeUnitLevelAddress(query) ||
      looksLikeUnitLevelAddress(intel.address),
  };
  intel.sources = [...new Set(sources.filter(Boolean))];
  intel.fetchedAt = new Date().toISOString();

  if (!input.bypassCache) {
    await setCachedPropertyIntel(query, intel);
  }

  return intel;
}
