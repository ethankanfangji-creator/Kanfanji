export type NormalizedAddress = {
  lat: number;
  lng: number;
  formatted_address: string;
  source: string;
  city?: string;
  province?: string;
  country?: string;
  score?: number;
};

type BcFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    fullAddress?: string;
    score?: number;
    localityName?: string;
    provinceCode?: string;
  };
};

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
};

/**
 * Normalize a free-text address via Geocode APIs.
 * Prefers BC Address Geocoder, falls back to OpenStreetMap Nominatim.
 */
export async function normalizeAddress(address: string): Promise<NormalizedAddress> {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error("請輸入地址");
  }

  const bc = await normalizeViaBc(trimmed);
  if (bc) return bc;

  const osm = await normalizeViaNominatim(trimmed);
  if (osm) return osm;

  throw new Error("無法正規化這個地址，請換更完整的寫法再試");
}

async function normalizeViaBc(query: string): Promise<NormalizedAddress | null> {
  const url = new URL("https://geocoder.api.gov.bc.ca/addresses.json");
  url.searchParams.set("addressString", query);
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("minScore", "50");
  url.searchParams.set("outputSRS", "4326");

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { features?: BcFeature[] };
  const feature = data.features?.[0];
  const props = feature?.properties;
  const [lng, lat] = feature?.geometry?.coordinates ?? [];
  if (!props?.fullAddress || lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    formatted_address: props.fullAddress,
    source: "BC Address Geocoder",
    city: props.localityName,
    province: props.provinceCode || "BC",
    country: "Canada",
    score: props.score,
  };
}

async function normalizeViaNominatim(query: string): Promise<NormalizedAddress | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "KanFangJi/0.1 (open-house recorder; contact@localhost)",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;

  const rows = (await res.json()) as NominatimResult[];
  const row = rows[0];
  const lat = row?.lat ? Number(row.lat) : NaN;
  const lng = row?.lon ? Number(row.lon) : NaN;
  if (!row?.display_name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const addr = row.address ?? {};
  return {
    lat,
    lng,
    formatted_address: row.display_name,
    source: "OpenStreetMap Nominatim",
    city: addr.city || addr.town || addr.village,
    province: addr.state,
    country: addr.country,
  };
}
