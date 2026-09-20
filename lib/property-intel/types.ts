/**
 * Property intelligence assembled for Viewing Chat (address → intel card).
 * Sources: BC Geocoder + Metro Open Data, Google Places (optional), Bing Search snippets (optional).
 * Never invent listing facts — missing fields stay null / empty.
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

export type PropertyIntelLocation = {
  skytrain: string | null;
  schools: string[];
  supermarket: string | null;
  park: string | null;
  noise: string | null;
  lat: number | null;
  lng: number | null;
};

export type PropertyIntel = {
  address: string;
  basic: PropertyIntelBasic;
  history: PropertyIntelHistory;
  location: PropertyIntelLocation;
  risks: string[];
  sources: string[];
  fetchedAt: string;
};

export function emptyIntel(address: string): PropertyIntel {
  return {
    address,
    basic: { year: null, type: null, beds: null, baths: null, area: null, pid: null },
    history: { last_sold: null, assessed: null, strata: null },
    location: {
      skytrain: null,
      schools: [],
      supermarket: null,
      park: null,
      noise: null,
      lat: null,
      lng: null,
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
    /\b(hwy|highway|freeway|lougheed|kingsway|hastings|broadway|granville|marine|barnet|westwood|guilford|fraser|oak|cambie|boundary|canada way)\b/i;
  if (!major.test(address)) return null;
  const street = address.split(",")[0]?.trim() || address;
  return `${street} 可能是主幹道／車流較多`;
}

export function detectStrata(type: string | null, strataFee: string | null): boolean {
  if (strataFee) return true;
  if (!type) return false;
  return /strata|condo|townhouse|apartment|公寓|鎮屋|連棟/i.test(type);
}
