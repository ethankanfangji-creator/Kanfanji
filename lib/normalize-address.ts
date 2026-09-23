export type NormalizedAddress = {
  lat: number;
  lng: number;
  formatted_address: string;
  source: string;
  city?: string;
  province?: string;
  country?: string;
  countryCode?: string;
  postalCode?: string;
  county?: string;
  municipality?: string;
  district?: string;
  houseNumber?: string;
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
    county?: string;
    municipality?: string;
    city_district?: string;
    suburb?: string;
    quarter?: string;
    house_number?: string;
    country_code?: string;
    postcode?: string;
  };
};

/**
 * Normalize a free-text address via Geocode APIs.
 * CA → BC first; otherwise Google (when keyed) then Nominatim.
 * Never invent coordinates.
 */
export async function normalizeAddress(address: string): Promise<NormalizedAddress> {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error("請輸入地址");
  }

  const preferBc =
    /\b(BC|B\.C\.|British Columbia|Vancouver|Burnaby|Richmond|Surrey|Canada)\b/i.test(
      trimmed,
    ) || /加拿大|溫哥華|本拿比|列治文/.test(trimmed);

  if (preferBc) {
    const bc = await normalizeViaBc(trimmed);
    if (bc) return bc;
  }

  const google = await normalizeViaGoogle(trimmed);
  if (google) return google;

  if (!preferBc) {
    const bc = await normalizeViaBc(trimmed);
    if (bc) return bc;
  }

  const osm = await normalizeViaNominatim(trimmed);
  if (osm) return osm;

  throw new Error("無法正規化這個地址，請換更完整的寫法再試");
}

async function normalizeViaGoogle(query: string): Promise<NormalizedAddress | null> {
  const { geocodeWithGoogle } = await import("@/lib/property-intel/google-places");
  const g = await geocodeWithGoogle(query);
  if (!g) return null;
  return {
    lat: g.lat,
    lng: g.lng,
    formatted_address: g.formattedAddress || query,
    source: "Google Geocoding",
    city: g.city,
    province: g.admin1,
    country: g.countryCode === "US" ? "United States" : g.countryCode === "CA" ? "Canada" : g.countryCode === "TW" ? "Taiwan" : undefined,
    countryCode: g.countryCode,
    postalCode: g.postalCode,
    county: g.county,
    houseNumber: g.streetNumber,
  };
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
    countryCode: "CA",
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
    countryCode: addr.country_code ? addr.country_code.toUpperCase() : undefined,
    postalCode: addr.postcode,
    county: addr.county,
    municipality: addr.municipality,
    district: addr.city_district || addr.suburb || addr.quarter,
    houseNumber: addr.house_number,
  };
}
