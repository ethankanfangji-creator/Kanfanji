/**
 * Pure helpers for the address confirmation step: lookup returns a candidate;
 * the viewing stays unbound (`identified=false`) until the user confirms.
 */

export type AddressLookupPayloadLike = {
  error?: string;
  market?: "CA" | "US" | "TW" | "TH" | "OTHER";
  displayAddress?: string;
  tags?: string[];
  source?: string;
  propertyId?: string;
  details?: Record<string, unknown>;
};

export type AddressConfirmationCandidate = {
  displayAddress: string;
  propertyId: string | null;
  lat: number | null;
  lng: number | null;
  market: "CA" | "US" | "TW" | "TH" | "OTHER" | null;
  source: string | null;
  tags: string[];
  mapEmbedUrl: string | null;
  openMapUrl: string | null;
};

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readCoord(
  details: Record<string, unknown> | undefined,
  key: "lat" | "lng",
): number | null {
  if (!details) return null;
  return asFiniteNumber(details[key]);
}

function readPropertyId(payload: AddressLookupPayloadLike): string | null {
  const top = payload.propertyId?.trim();
  if (top) return top;
  const nested = payload.details?.propertyId;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  return null;
}

/** OSM embed + open URL for a coordinate pair (no third-party map SDK). */
export function buildMapUrls(lat: number, lng: number): {
  mapEmbedUrl: string;
  openMapUrl: string;
} {
  const delta = 0.008;
  const west = lng - delta;
  const south = lat - delta;
  const east = lng + delta;
  const north = lat + delta;
  const bbox = `${west}%2C${south}%2C${east}%2C${north}`;
  return {
    mapEmbedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`,
    openMapUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`,
  };
}

/**
 * Build a confirmation-card model from a successful lookup payload.
 * Returns null when there is nothing useful to confirm (empty display).
 */
export function buildAddressConfirmationCandidate(
  payload: AddressLookupPayloadLike,
  queryAddress: string,
): AddressConfirmationCandidate | null {
  const display =
    payload.displayAddress?.trim() ||
    (typeof payload.details?.normalizedAddress === "string"
      ? payload.details.normalizedAddress.trim()
      : "") ||
    queryAddress.trim();
  if (!display) return null;

  const lat = readCoord(payload.details, "lat");
  const lng = readCoord(payload.details, "lng");
  const map =
    lat != null && lng != null ? buildMapUrls(lat, lng) : { mapEmbedUrl: null, openMapUrl: null };

  return {
    displayAddress: display,
    propertyId: readPropertyId(payload),
    lat,
    lng,
    market: payload.market ?? null,
    source: payload.source?.trim() || null,
    tags: payload.tags?.length ? [...payload.tags] : [],
    mapEmbedUrl: map.mapEmbedUrl,
    openMapUrl: map.openMapUrl,
  };
}
