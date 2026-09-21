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
): Promise<AddressLookupResult> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url, {
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

  let result = await reverseGeocodeNominatim(lat, lng);
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

export async function lookupAddressDetails(query: string): Promise<AddressLookupResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("請輸入地址");
  }

  // 1) Normalize via Geocode API → lat/lng + formatted_address
  const normalized = await normalizeAddress(trimmed);
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

/** Re-export for callers that only need geocode normalization. */
export { normalizeAddress } from "@/lib/normalize-address";
