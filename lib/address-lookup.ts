import { enrichMetroOpenData, type MetroOpenData } from "@/lib/metro-opendata";
import { normalizeAddress } from "@/lib/normalize-address";
import { findOrCreateProperty } from "@/lib/properties";

export type Market = "CA" | "US" | "TW" | "TH" | "OTHER";

export type AddressLookupResult = {
  market: Market;
  displayAddress: string;
  tags: string[];
  source: string;
  propertyId?: string;
  details: {
    city?: string;
    localityType?: string;
    province?: string;
    neighborhood?: string;
    country?: string;
    countryCode?: string;
    postalCode?: string;
    lat?: number;
    lng?: number;
    score?: number;
    matchPrecision?: string;
    mlsNote?: string;
    normalizedAddress?: string;
    propertyId?: string;
    openData?: MetroOpenData | null;
  };
};

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: {
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
  type?: string;
  addresstype?: string;
};

function detectMarketHint(query: string, country?: string, countryCode?: string): Market {
  const code = (countryCode || "").toUpperCase();
  if (code === "CA") return "CA";
  if (code === "US") return "US";
  if (code === "TW") return "TW";
  if (code === "TH") return "TH";

  if (/bangkok|曼谷|sukhumvit|สุขุมวิท|thailand|泰國|กรุงเทพ/i.test(query)) {
    return "TH";
  }
  if (/台灣|臺灣|台北|臺北|新北|桃園|台中|臺中|高雄|台南|臺南|\bTW\b|Taiwan/i.test(query)) {
    return "TW";
  }
  if (
    /\b(USA|United States)\b/i.test(query) ||
    /,\s*[A-Z]{2}\s+\d{5}(-\d{4})?\b/.test(query) ||
    /united states|美國|美国/i.test(country || "")
  ) {
    return "US";
  }
  if (
    /\b(bc|b\.c\.|british columbia|vancouver|burnaby|richmond|surrey|coquitlam|port coquitlam|north vancouver|west vancouver|victoria|kelowna|abbotsford)\b/i.test(
      query,
    ) ||
    /加拿大|溫哥華|本拿比|列治文|素里|高貴林/.test(query) ||
    /canada|british columbia/i.test(country || "")
  ) {
    return "CA";
  }
  return "OTHER";
}

async function enrichNeighborhood(result: AddressLookupResult): Promise<AddressLookupResult> {
  if (result.details.neighborhood || result.details.lat == null || result.details.lng == null) {
    return result;
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(result.details.lat));
  url.searchParams.set("lon", String(result.details.lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("zoom", "16");
  url.searchParams.set("addressdetails", "1");

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "KanFangJi/0.1 (open-house recorder; contact@localhost)",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return result;
    const row = (await res.json()) as NominatimResult;
    const neighborhood = row.address?.suburb || row.address?.neighbourhood;
    if (!neighborhood) return result;

    const tags = [...result.tags];
    if (!tags.includes(neighborhood)) {
      tags.splice(1, 0, neighborhood);
    }

    return {
      ...result,
      tags: tags.slice(0, 5),
      source: `${result.source} + OSM 社區`,
      details: {
        ...result.details,
        neighborhood,
        postalCode: result.details.postalCode || row.address?.postcode,
      },
    };
  } catch {
    return result;
  }
}

async function reverseGeocodeNominatim(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<AddressLookupResult> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "KanFangJi/0.1 (open-house recorder; contact@localhost)",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error("無法從 GPS 反查地址");
  }

  const row = (await res.json()) as NominatimResult & {
    error?: string;
    display_name?: string;
  };
  if (row.error || !row.display_name) {
    throw new Error("無法從 GPS 反查地址");
  }

  const city =
    row.address?.city || row.address?.town || row.address?.village || undefined;
  const province = row.address?.state;
  const country = row.address?.country;
  const countryCode = row.address?.country_code?.toUpperCase();
  const market = detectMarketHint(row.display_name, country || countryCode);
  const neighborhood = row.address?.suburb || row.address?.neighbourhood;

  return {
    market,
    displayAddress: row.display_name,
    tags: [city, province, country].filter(Boolean) as string[],
    source: "EXIF GPS + OSM reverse",
    details: {
      city,
      province,
      country,
      neighborhood,
      postalCode: row.address?.postcode,
      lat,
      lng,
      normalizedAddress: row.display_name.toLowerCase().trim(),
      mlsNote: "建議來自照片 EXIF GPS，非影像辨識",
    },
  };
}

/**
 * Reverse-geocode consented EXIF GPS coordinates.
 * Does not accept or analyze photo bytes — coordinates only.
 */
export async function lookupAddressDetailsFromGps(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<AddressLookupResult> {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new Error("GPS 座標無效");
  }

  let result = await reverseGeocodeNominatim(lat, lng, signal);
  if (result.market === "CA") {
    result = await withMetroOpenData(await enrichNeighborhood(result));
  }
  result = await withPropertyRegistry(result);
  return result;
}

async function withMetroOpenData(result: AddressLookupResult): Promise<AddressLookupResult> {
  if (result.market !== "CA") return result;

  const openData = await enrichMetroOpenData(
    result.details.city,
    result.details.lng,
    result.details.lat,
  );
  if (!openData) return result;

  const tags = [...result.tags];
  if (openData.zoningCode && !tags.includes(openData.zoningCode)) {
    tags.push(`Zoning ${openData.zoningCode}`);
  }
  if (openData.pid && !tags.some((t) => t.includes(openData.pid!))) {
    tags.push(`PID ${openData.pid}`);
  }

  return {
    ...result,
    tags: tags.slice(0, 6),
    source: `${result.source} + ${openData.source || "Metro Open Data"}`,
    details: {
      ...result.details,
      openData,
    },
  };
}

async function withPropertyRegistry(result: AddressLookupResult): Promise<AddressLookupResult> {
  const lat = result.details.lat;
  const lng = result.details.lng;
  const normalized =
    result.details.normalizedAddress || result.displayAddress.toLowerCase().trim();

  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return result;
  }

  try {
    const zoning = result.details.openData?.zoningCode || null;
    const countryCode =
      result.details.countryCode ||
      (result.market === "OTHER" || result.market === "TH" ? null : result.market);
    const propertyId = await findOrCreateProperty({
      normalizedAddress: normalized,
      lat,
      lng,
      zoning,
      countryCode,
      admin1: result.details.province ?? null,
      city: result.details.city ?? null,
      postalCode: result.details.postalCode ?? null,
    });

    return {
      ...result,
      propertyId,
      details: {
        ...result.details,
        propertyId,
        normalizedAddress: normalized,
      },
    };
  } catch {
    // Registry is best-effort prep; lookup still succeeds without property_id
    return result;
  }
}

export async function lookupAddressDetails(
  query: string,
  signal?: AbortSignal,
): Promise<AddressLookupResult> {
  if (signal?.aborted) {
    const err = new Error("ADDRESS_LOOKUP_ABORTED");
    err.name = "AbortError";
    throw err;
  }
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("請輸入地址");
  }

  // 1) Normalize via Geocode API → lat/lng + formatted_address
  const normalized = await normalizeAddress(trimmed);
  if (signal?.aborted) {
    const err = new Error("ADDRESS_LOOKUP_ABORTED");
    err.name = "AbortError";
    throw err;
  }
  const market = detectMarketHint(
    normalized.formatted_address,
    normalized.country,
    normalized.countryCode,
  );

  let result: AddressLookupResult = {
    market,
    displayAddress: normalized.formatted_address,
    tags: [normalized.city, normalized.province, normalized.country].filter(Boolean) as string[],
    source: normalized.source,
    details: {
      city: normalized.city,
      province: normalized.province,
      country: normalized.country,
      countryCode: normalized.countryCode,
      postalCode: normalized.postalCode,
      lat: normalized.lat,
      lng: normalized.lng,
      score: normalized.score,
      normalizedAddress: normalized.formatted_address.toLowerCase().trim(),
      mlsNote: "MLS/CREA DDF 需仲介帳號授權，尚未接上",
    },
  };

  // 2) Enrich neighborhood + Metro open data
  if (market === "CA") {
    result = await withMetroOpenData(await enrichNeighborhood(result));
  }

  // 3) Dedupe into properties (exact address or within 500m)
  result = await withPropertyRegistry(result);

  return result;
}

export type ClassifiedLookup =
  | { ok: true; kind: "place"; placeId: string }
  | { ok: true; kind: "osm"; osmId: string; lat?: number; lng?: number }
  | { ok: true; kind: "coords"; lat: number; lng: number }
  | { ok: true; kind: "free_text"; address: string }
  | { ok: false; code: string; error: string };

/** Decide which lookup path a request body is allowed to take. */
export function classifyLookupBody(input: {
  address?: string;
  placeId?: string;
  osmId?: string;
  lat?: number;
  lng?: number;
  freeText?: boolean;
}): ClassifiedLookup {
  const address = input.address?.trim() || "";
  const placeId = stripPlaceId(input.placeId ?? "");
  const osmId = (input.osmId ?? "").trim();
  const hasCoords = input.lat !== undefined || input.lng !== undefined;
  const idCount = Number(Boolean(placeId)) + Number(Boolean(osmId));

  if (idCount > 1 || ((placeId || osmId) && address)) {
    return {
      ok: false,
      code: "lookup_ambiguous",
      error: "Use placeId, osmId, coordinates, or a free-text address — not a mix",
    };
  }
  if (placeId) {
    return { ok: true, kind: "place", placeId };
  }
  if (osmId) {
    return {
      ok: true,
      kind: "osm",
      osmId,
      lat: input.lat,
      lng: input.lng,
    };
  }
  if (hasCoords && input.lat !== undefined && input.lng !== undefined) {
    return { ok: true, kind: "coords", lat: input.lat, lng: input.lng };
  }
  if (address) {
    if (!input.freeText) {
      return {
        ok: false,
        code: "address_requires_free_text",
        error:
          "Address-string lookup is only for free text that was not picked from suggestions. Send freeText:true, or send placeId / osmId for a selected row.",
      };
    }
    return { ok: true, kind: "free_text", address };
  }
  return { ok: false, code: "address_required", error: "Address required" };
}

export function stripPlaceId(raw: string): string {
  return raw.replace(/^gplace:/, "").replace(/^places\//, "").trim();
}

export async function lookupAddressDetailsByPlaceId(
  placeId: string,
  signal?: AbortSignal,
): Promise<AddressLookupResult> {
  if (signal?.aborted) {
    const err = new Error("ADDRESS_LOOKUP_ABORTED");
    err.name = "AbortError";
    throw err;
  }
  const id = stripPlaceId(placeId);
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!id || !key) {
    throw new Error("無法用 placeId 查詢地址");
  }
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
    signal,
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents",
    },
  });
  if (!res.ok) throw new Error("無法用 placeId 查詢地址");
  const data = (await res.json()) as {
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
  };
  const formatted = data.formattedAddress?.trim() || "";
  const lat = data.location?.latitude;
  const lng = data.location?.longitude;
  if (!formatted || typeof lat !== "number" || typeof lng !== "number") {
    throw new Error("無法用 placeId 查詢地址");
  }
  const pick = (type: string, short = false) => {
    const comp = data.addressComponents?.find((c) => c.types?.includes(type));
    return short ? comp?.shortText : comp?.longText;
  };
  const city = pick("locality") || pick("postal_town") || pick("sublocality");
  const province = pick("administrative_area_level_1", true);
  const country = pick("country");
  const countryCode = pick("country", true);
  const market = detectMarketHint(formatted, country, countryCode);
  let result: AddressLookupResult = {
    market,
    displayAddress: formatted,
    tags: [city, province, country].filter(Boolean) as string[],
    source: "Google Place Details",
    details: {
      city,
      province,
      country,
      countryCode,
      postalCode: pick("postal_code"),
      lat,
      lng,
      normalizedAddress: formatted.toLowerCase(),
    },
  };
  if (market === "CA") {
    result = await withMetroOpenData(await enrichNeighborhood(result));
  }
  return withPropertyRegistry(result);
}

export async function lookupAddressDetailsByOsmId(
  osmId: string,
  coords?: { lat?: number; lng?: number },
  signal?: AbortSignal,
): Promise<AddressLookupResult> {
  if (
    typeof coords?.lat === "number" &&
    typeof coords.lng === "number"
  ) {
    return lookupAddressDetailsFromGps(coords.lat, coords.lng, signal);
  }
  if (signal?.aborted) {
    const err = new Error("ADDRESS_LOOKUP_ABORTED");
    err.name = "AbortError";
    throw err;
  }
  const lookupId = osmId.replace(/^photon:/, "").trim();
  const osmIds = /^[NWR]\d+$/i.test(lookupId) ? lookupId.toUpperCase() : `N${lookupId}`;
  const url = new URL("https://nominatim.openstreetmap.org/lookup");
  url.searchParams.set("osm_ids", osmIds);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  const res = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "KanFangJi/0.1 (open-house recorder; contact@localhost)",
    },
  });
  if (!res.ok) throw new Error("無法用 osmId 查詢地址");
  const rows = (await res.json()) as NominatimResult[];
  const row = rows[0];
  if (!row?.display_name || !row.lat || !row.lon) {
    throw new Error("無法用 osmId 查詢地址");
  }
  return lookupAddressDetailsFromGps(Number(row.lat), Number(row.lon), signal);
}

/** Re-export for callers that only need geocode normalization. */
export { normalizeAddress } from "@/lib/normalize-address";
