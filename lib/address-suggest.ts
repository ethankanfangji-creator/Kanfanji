export type AddressSuggestion = {
  id: string;
  label: string;
  secondary?: string;
  lat?: number;
  lng?: number;
  city?: string;
  province?: string;
  country?: string;
  score?: number;
  source: "bc_geocoder" | "nominatim";
};

type BcFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    fullAddress?: string;
    score?: number;
    localityName?: string;
    provinceCode?: string;
    streetName?: string;
    streetNumber?: string;
  };
};

type NominatimResult = {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    suburb?: string;
    neighbourhood?: string;
  };
};

const USER_AGENT = "KanFangJi/0.1 (open-house recorder; contact@localhost)";

/**
 * Autocomplete suggestions for Step 1.
 * Prefers BC Address Geocoder; falls back to Nominatim.
 */
export async function suggestAddresses(
  query: string,
  options?: { limit?: number },
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const limit = Math.min(Math.max(options?.limit ?? 6, 1), 10);
  const bc = await suggestViaBc(trimmed, limit);
  if (bc.length > 0) return bc;
  return suggestViaNominatim(trimmed, limit);
}

async function suggestViaBc(query: string, limit: number): Promise<AddressSuggestion[]> {
  const url = new URL("https://geocoder.api.gov.bc.ca/addresses.json");
  url.searchParams.set("addressString", query);
  url.searchParams.set("maxResults", String(limit));
  url.searchParams.set("minScore", "40");
  url.searchParams.set("autoComplete", "true");
  url.searchParams.set("outputSRS", "4326");

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error("ADDRESS_SUGGEST_UPSTREAM");

  const data = (await res.json()) as { features?: BcFeature[] };
  const out: AddressSuggestion[] = [];
  for (const [index, feature] of (data.features ?? []).entries()) {
    const props = feature.properties;
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    if (!props?.fullAddress) continue;
    out.push({
      id: `bc:${props.fullAddress}:${index}`,
      label: props.fullAddress,
      secondary: [props.localityName, props.provinceCode || "BC"].filter(Boolean).join(", "),
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      city: props.localityName,
      province: props.provinceCode || "BC",
      country: "Canada",
      score: props.score,
      source: "bc_geocoder",
    });
  }
  return out;
}

async function suggestViaNominatim(
  query: string,
  limit: number,
): Promise<AddressSuggestion[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error("ADDRESS_SUGGEST_UPSTREAM");

  const rows = (await res.json()) as NominatimResult[];
  return rows
    .filter((row) => Boolean(row.display_name))
    .map((row, index) => {
      const city = row.address?.city || row.address?.town || row.address?.village;
      const neighborhood = row.address?.suburb || row.address?.neighbourhood;
      const lat = row.lat ? Number(row.lat) : NaN;
      const lng = row.lon ? Number(row.lon) : NaN;
      return {
        id: `osm:${row.place_id ?? index}`,
        label: row.display_name!,
        secondary: [neighborhood, city, row.address?.state].filter(Boolean).join(", "),
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
        city,
        province: row.address?.state,
        country: row.address?.country,
        source: "nominatim" as const,
      };
    });
}
