/**
 * Property intelligence assembled for Viewing Chat (address → intel card).
 * Sources (see docs/STACK.md): BC/Google geocode, Google Places, OSM Overpass,
 * Street View, Bing snippets, optional Attom / TW open-data adapters.
 * Never invent listing facts — missing fields stay null / empty.
 * No site crawling — search snippets / official APIs only.
 */

export type PropertyIntelBasic = {
  year: number | null;
  type: string | null;
  beds: number | null;
  baths: number | null;
  area: number | null;
  pid: string | null;
};

export type PropertyIntelHistory = {
  last_sold: string | null;
  assessed: string | null;
  strata: string | null;
};

export type AmenityHit = {
  kind: string;
  name: string;
  minutesWalk: number | null;
  source: string;
  lat?: number | null;
  lng?: number | null;
  straightLineMeters?: number | null;
};

export type PropertyIntelLocation = {
  skytrain: string | null;
  bus: string | null;
  schools: string[];
  supermarket: string | null;
  park: string | null;
  hospital: string | null;
  noise: string | null;
  lat: number | null;
  lng: number | null;
  amenities: AmenityHit[];
};

export type PropertyIntelVisuals = {
  /** Google Street View Static URL (or null if unavailable) */
  streetViewUrl: string | null;
};

export type PropertyIntelNeighborhood = {
  name: string | null;
  builder: string | null;
  amenityRatio: string | null;
  notes: string[];
};

export type PropertyIntelMarket = {
  region: "CA" | "TW" | "US" | "OTHER" | null;
  avgUnitPrice: string | null;
  priceRange: string | null;
  currency: string | null;
};

/** Compliance flags — UI copy stays in i18n, not stored as prose. */
export type PropertyIntelCompliance = {
  /** Street View may show faces / license plates */
  streetViewNotice: boolean;
  /** Exact unit / 戶 is sensitive + valuation may be noisy */
  unitLevelNotice: boolean;
};

export type PropertyIntel = {
  address: string;
  /** Canonical query used for cache / upstream (台→臺, floors normalized) */
  normalizedQuery: string;
  basic: PropertyIntelBasic;
  history: PropertyIntelHistory;
  location: PropertyIntelLocation;
  visuals: PropertyIntelVisuals;
  neighborhood: PropertyIntelNeighborhood;
  market: PropertyIntelMarket;
  compliance: PropertyIntelCompliance;
  risks: string[];
  sources: string[];
  fetchedAt: string;
};

export function looksLikeUnitLevelAddress(address: string): boolean {
  return /(\d+\s*[樓层層]|[Ff]l(?:oor)?\.?\s*\d+|unit\s*#?\s*\d+|apt\.?\s*#?\s*\d+|#\s*\d+\b|之\d+|戶)/i.test(
    address,
  );
}

export function emptyIntel(address: string, normalizedQuery = address): PropertyIntel {
  return {
    address,
    normalizedQuery,
    basic: { year: null, type: null, beds: null, baths: null, area: null, pid: null },
    history: { last_sold: null, assessed: null, strata: null },
    location: {
      skytrain: null,
      bus: null,
      schools: [],
      supermarket: null,
      park: null,
      hospital: null,
      noise: null,
      lat: null,
      lng: null,
      amenities: [],
    },
    visuals: { streetViewUrl: null },
    neighborhood: { name: null, builder: null, amenityRatio: null, notes: [] },
    market: { region: null, avgUnitPrice: null, priceRange: null, currency: null },
    compliance: {
      streetViewNotice: false,
      unitLevelNotice: looksLikeUnitLevelAddress(address) || looksLikeUnitLevelAddress(normalizedQuery),
    },
    risks: [],
    sources: [],
    fetchedAt: new Date().toISOString(),
  };
}

/** Era-based BC open-house risk tags (heuristic, not a survey). */
export function buildRiskTags(year: number | null, isStrata: boolean): string[] {
  const risks: string[] = [];
  if (year != null && Number.isFinite(year)) {
    if (year < 1980) {
      risks.push("Federal Pioneer 電箱", "Poly-B 水管", "石棉", "油罐可能");
    } else if (year < 1990) {
      risks.push("鋁線", "Poly-B", "單層窗");
    }
    if (isStrata && year < 2000) {
      risks.push("雨幕漏水 (2000年前)");
    }
  } else if (isStrata) {
    risks.push("雨幕漏水 (2000年前)");
  }
  return [...new Set(risks)];
}

export function walkingMinutesFromMeters(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 1;
  return Math.max(1, Math.round(meters / 80));
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function guessNoiseNote(address: string): string | null {
  const major =
    /\b(hwy|highway|freeway|lougheed|kingsway|hastings|broadway|granville|marine|barnet|westwood|guilford|fraser|oak|cambie|boundary|canada way|中山|忠孝|信義|建國|環河|快速道路)\b/i;
  if (!major.test(address)) return null;
  const street = address.split(",")[0]?.trim() || address;
  return `${street} 可能是主幹道／車流較多`;
}

export function detectStrata(type: string | null, strataFee: string | null): boolean {
  if (strataFee) return true;
  if (!type) return false;
  return /strata|condo|townhouse|apartment|公寓|鎮屋|連棟/i.test(type);
}

export function detectMarketRegion(address: string): PropertyIntelMarket["region"] {
  if (/台灣|臺灣|台北|臺北|新北|桃園|台中|臺中|高雄|台南|臺南|\bTW\b|Taiwan/i.test(address)) {
    return "TW";
  }
  if (
    /\b(BC|B\.C\.|British Columbia|Vancouver|Burnaby|Richmond|Surrey|Coquitlam|Ontario|Toronto|Canada)\b/i.test(
      address,
    )
  ) {
    return "CA";
  }
  if (/\b(USA|United States|CA|NY|WA|OR|TX|FL)\b/.test(address) || /,\s*[A-Z]{2}\s+\d{5}/.test(address)) {
    return "US";
  }
  return "OTHER";
}

export function mergeAmenityLabel(
  existing: string | null,
  candidate: string | null,
): string | null {
  return existing || candidate;
}
