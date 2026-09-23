export type AddressSuggestion = {
  id: string;
  /** Full address committed when the user picks this row. */
  label: string;
  /** Short first line in the dropdown (street). Falls back to `label`. */
  title?: string;
  /** Optional second line (city / region). Omit when it only repeats `title`. */
  secondary?: string;
  lat?: number;
  lng?: number;
  city?: string;
  province?: string;
  country?: string;
  score?: number;
  source: "bc_geocoder" | "nominatim" | "google";
};

export type SuggestRegion = "CA" | "US" | "TW" | "OTHER";

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
    country_code?: string;
  };
};

const USER_AGENT = "KanFangJi/0.1 (open-house recorder; contact@localhost)";

function googleKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    null
  );
}

/** Heuristic region for routing geocoders (suggest only — not authoritative). */
export function detectSuggestRegion(query: string): SuggestRegion {
  if (/台灣|臺灣|台北|臺北|新北|桃園|台中|臺中|高雄|台南|臺南|\bTW\b|Taiwan/i.test(query)) {
    return "TW";
  }
  // US: ZIP after state, with space or comma (e.g. "CA 93292" / "CA, 93292")
  if (
    /\b(USA|United States)\b/i.test(query) ||
    /,\s*[A-Z]{2}[,\s]+\d{5}(-\d{4})?\b/.test(query) ||
    /\b[A-Z]{2}[,\s]+\d{5}(-\d{4})?\b/.test(query)
  ) {
    return "US";
  }
  if (
    /\b(BC|B\.C\.|British Columbia|Vancouver|Burnaby|Richmond|Surrey|Coquitlam|Ontario|Toronto|Canada|Alberta|Montreal)\b/i.test(
      query,
    ) ||
    /加拿大|溫哥華|本拿比|列治文|素里|高貴林/.test(query)
  ) {
    return "CA";
  }
  // Bare ZIP-style (5 digits) without Canadian postal pattern
  if (/\b\d{5}(-\d{4})?\b/.test(query) && !/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i.test(query)) {
    return "US";
  }
  return "OTHER";
}

/**
 * Autocomplete suggestions for address entry.
 * CA/BC → BC Geocoder first; US/TW/OTHER → Google (when keyed) then Nominatim.
 * Never invent addresses — empty list if all upstreams miss.
 */
export async function suggestAddresses(
  query: string,
  options?: { limit?: number },
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const limit = Math.min(Math.max(options?.limit ?? 5, 1), 8);
  const region = detectSuggestRegion(trimmed);

  if (region === "CA") {
    const bc = await suggestViaBc(trimmed, limit);
    if (bc.length > 0) return bc;
  }

  const google = await suggestViaGoogleAutocomplete(trimmed, limit, region);
  if (google.length > 0) return google;

  const osm = await suggestViaNominatim(trimmed, limit, region);
  if (osm.length > 0) return osm;

  // Full-string geocode as last resort (helps complete US street+ZIP queries)
  return suggestViaGoogleGeocode(trimmed, limit, region);
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
  if (!res.ok) return [];

  const data = (await res.json()) as { features?: BcFeature[] };
  const out: AddressSuggestion[] = [];
  for (const [index, feature] of (data.features ?? []).entries()) {
    const props = feature.properties;
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    if (!props?.fullAddress) continue;
    out.push({
      id: `bc:${props.fullAddress}:${index}`,
      label: props.fullAddress,
      title:
        [props.streetNumber, props.streetName].filter(Boolean).join(" ") ||
        props.fullAddress,
      secondary: [props.localityName, props.provinceCode || "BC"]
        .filter(Boolean)
        .join(", "),
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
  region: SuggestRegion,
): Promise<AddressSuggestion[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));
  if (region === "US") url.searchParams.set("countrycodes", "us");
  if (region === "CA") url.searchParams.set("countrycodes", "ca");
  if (region === "TW") url.searchParams.set("countrycodes", "tw");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];

  const rows = (await res.json()) as NominatimResult[];
  return rows
    .filter((row) => Boolean(row.display_name))
    .map((row, index) => {
      const city = row.address?.city || row.address?.town || row.address?.village;
      const lat = row.lat ? Number(row.lat) : NaN;
      const lng = row.lon ? Number(row.lon) : NaN;
      const parts = row.display_name!.split(",").map((part) => part.trim()).filter(Boolean);
      const title = parts.slice(0, 2).join(", ") || row.display_name!;
      const secondary = parts.slice(2, 5).join(", ") || undefined;
      return {
        id: `osm:${row.place_id ?? index}`,
        label: row.display_name!,
        title,
        secondary: secondary && secondary !== title ? secondary : undefined,
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
        city,
        province: row.address?.state,
        country: row.address?.country,
        source: "nominatim" as const,
      };
    });
}

async function suggestViaGoogleAutocomplete(
  query: string,
  limit: number,
  region: SuggestRegion,
): Promise<AddressSuggestion[]> {
  const key = googleKey();
  if (!key) return [];

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", query);
    url.searchParams.set("types", "address");
    url.searchParams.set("key", key);
    if (region === "US") url.searchParams.set("components", "country:us");
    if (region === "CA") url.searchParams.set("components", "country:ca");
    if (region === "TW") url.searchParams.set("components", "country:tw");

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      status?: string;
      predictions?: Array<{
        place_id?: string;
        description?: string;
        structured_formatting?: {
          main_text?: string;
          secondary_text?: string;
        };
      }>;
    };
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return [];
    }

    return (data.predictions ?? [])
      .filter((row) => Boolean(row.description))
      .slice(0, limit)
      .map((row, index) => {
        const main = row.structured_formatting?.main_text?.trim();
        const secondary = row.structured_formatting?.secondary_text?.trim();
        return {
          id: `gplace:${row.place_id ?? index}`,
          label: row.description!,
          title: main || row.description!,
          secondary: secondary && secondary !== main ? secondary : undefined,
          source: "google" as const,
        };
      });
  } catch {
    return [];
  }
}

async function suggestViaGoogleGeocode(
  query: string,
  limit: number,
  region: SuggestRegion,
): Promise<AddressSuggestion[]> {
  const key = googleKey();
  if (!key) return [];

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("key", key);
    if (region === "US") url.searchParams.set("components", "country:US");
    if (region === "CA") url.searchParams.set("components", "country:CA");
    if (region === "TW") url.searchParams.set("components", "country:TW");

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        place_id?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
        address_components?: Array<{
          long_name?: string;
          short_name?: string;
          types?: string[];
        }>;
      }>;
    };
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return [];
    }

    return (data.results ?? [])
      .filter((row) => Boolean(row.formatted_address))
      .slice(0, limit)
      .map((row, index) => {
        const pick = (type: string, short = false) => {
          const comp = row.address_components?.find((c) => c.types?.includes(type));
          return short ? comp?.short_name : comp?.long_name;
        };
        const lat = row.geometry?.location?.lat;
        const lng = row.geometry?.location?.lng;
        const city =
          pick("locality") || pick("postal_town") || pick("sublocality") || undefined;
        const province = pick("administrative_area_level_1", true) || undefined;
        const country = pick("country") || undefined;
        return {
          id: `ggeo:${row.place_id ?? index}`,
          label: row.formatted_address!,
          title: [pick("street_number"), pick("route")].filter(Boolean).join(" ") ||
            row.formatted_address!,
          secondary: [city, province, country].filter(Boolean).join(", ") || undefined,
          lat: typeof lat === "number" ? lat : undefined,
          lng: typeof lng === "number" ? lng : undefined,
          city,
          province,
          country,
          source: "google" as const,
        };
      });
  } catch {
    return [];
  }
}
