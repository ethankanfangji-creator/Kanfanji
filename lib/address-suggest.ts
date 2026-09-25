export type AddressSuggestion = {
  id: string;
  /** Full address committed when the user picks this row. */
  label: string;
  /** Canonical display from the same place id (not a second text search). */
  formatted?: string;
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
  source: "bc_geocoder" | "nominatim" | "google" | "photon";
};

/** Metro Vancouver centre — open-house autocomplete bias, not a text re-geocode. */
export const METRO_VANCOUVER_BIAS = {
  latitude: 49.28,
  longitude: -122.91,
  radiusMeters: 45_000,
} as const;

/**
 * Keep British Columbia rows. Drops US lookalikes (Illinois, California, Kentucky).
 */
export function isBritishColumbiaAddress(parts: {
  label?: string;
  formatted?: string;
  secondary?: string;
  province?: string;
  country?: string;
}): boolean {
  const hay = [parts.province, parts.country, parts.formatted, parts.label, parts.secondary]
    .filter(Boolean)
    .join(" ");
  if (/\b(Illinois|Kentucky|California)\b/i.test(hay)) return false;
  if (/\b(USA|United States)\b/i.test(hay)) return false;
  return /\b(BC|B\.C\.|British Columbia)\b/i.test(hay);
}

export type SuggestRegion = "CA" | "US" | "TW" | "OTHER";

type NominatimResult = {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  class?: string;
  type?: string;
  addresstype?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    suburb?: string;
    neighbourhood?: string;
    country_code?: string;
    city_district?: string;
    quarter?: string;
  };
};

const USER_AGENT = "KanFangJi/0.1 (open-house recorder; contact@localhost)";

/** Mutually exclusive Taiwan city-level admin names (臺 normalized). */
const TW_CITY_ADMINS = [
  "臺北市",
  "新北市",
  "桃園市",
  "臺中市",
  "臺南市",
  "高雄市",
  "基隆市",
  "新竹市",
  "嘉義市",
] as const;

const NOMINATIM_NON_ADDRESS_CLASSES = new Set([
  "leisure",
  "tourism",
  "natural",
  "amenity",
  "shop",
  "office",
  "craft",
  "historic",
]);

const NOMINATIM_NON_ADDRESS_TYPES = new Set([
  "park",
  "garden",
  "playground",
  "pitch",
  "nature_reserve",
  "attraction",
  "museum",
  "viewpoint",
  "picnic_site",
  "recreation_ground",
]);

function googleKey(): string | null {
  // Suggest/geocode only — do not fall back to Places-only keys.
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
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

/** Normalize 台 → 臺 so Taipei/Taichung tokens compare consistently. */
export function normalizeTwAdminText(text: string): string {
  return text.replace(/台/g, "臺");
}

/**
 * Extract Taiwan admin tokens (市 / 縣 / 區 / 鄉 / 鎮) from free text.
 * Returns 臺-normalized tokens in appearance order (deduped).
 *
 * City-level `市` uses a 2-char prefix so「臺北市市府路」does not become「臺北市市」.
 */
export function extractTwAdminTokens(text: string): string[] {
  const normalized = normalizeTwAdminText(text);
  const matches =
    normalized.match(
      /[\u4e00-\u9fff]{2}市|[\u4e00-\u9fff]{1,3}(?:縣|區|鄉|鎮)/g,
    ) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of matches) {
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function twCityFromTokens(tokens: string[]): string | null {
  for (const token of tokens) {
    if ((TW_CITY_ADMINS as readonly string[]).includes(token)) return token;
  }
  return null;
}

/**
 * True when query and candidate imply different Taiwan city-level admins
 * (e.g. 臺北市 vs 新北市).
 */
export function twAdminDistrictMismatch(query: string, candidate: string): boolean {
  const qCity = twCityFromTokens(extractTwAdminTokens(query));
  const cCity = twCityFromTokens(extractTwAdminTokens(candidate));
  if (!qCity || !cCity) return false;
  return qCity !== cCity;
}

/** True when Nominatim row is a park / leisure POI rather than a street address. */
export function nominatimLooksLikeNonAddress(row: {
  class?: string;
  type?: string;
  addresstype?: string;
  display_name?: string;
}): boolean {
  const cls = (row.class ?? "").toLowerCase();
  const typ = (row.type ?? "").toLowerCase();
  const addrType = (row.addresstype ?? "").toLowerCase();
  if (NOMINATIM_NON_ADDRESS_CLASSES.has(cls)) return true;
  if (NOMINATIM_NON_ADDRESS_TYPES.has(typ) || NOMINATIM_NON_ADDRESS_TYPES.has(addrType)) {
    return true;
  }
  const name = row.display_name ?? "";
  // POI names like「福祿1號公園」are not street addresses even when they contain「號」.
  if (/公園|游樂場|風景區|動物園|植物園/.test(name)) return true;
  return false;
}

/**
 * Require query admin tokens (市/區) to appear in the Nominatim label when present.
 * City-level conflicts (臺北 vs 新北) fail.
 */
export function nominatimAdminCompatible(query: string, displayName: string): boolean {
  if (twAdminDistrictMismatch(query, displayName)) return false;
  const tokens = extractTwAdminTokens(query);
  if (tokens.length === 0) return true;
  const hay = normalizeTwAdminText(displayName);
  // Prefer city-level match when query names a city.
  const qCity = twCityFromTokens(tokens);
  if (qCity && !hay.includes(qCity)) return false;
  // District tokens (區) must also overlap when present.
  const districts = tokens.filter((t) => t.endsWith("區"));
  if (districts.length > 0 && !districts.some((d) => hay.includes(d))) {
    return false;
  }
  return true;
}

function filterNominatimRows(
  query: string,
  rows: NominatimResult[],
  region: SuggestRegion,
): NominatimResult[] {
  return rows.filter((row) => {
    if (!row.display_name) return false;
    if (nominatimLooksLikeNonAddress(row)) return false;
    if (region === "TW" && !nominatimAdminCompatible(query, row.display_name)) {
      return false;
    }
    return true;
  });
}

/**
 * Autocomplete is usable when non-empty; for TW, also require admin-token overlap
 * when the query includes city/district cues (avoids empty-ish wrong region hits).
 */
export function isReasonableGoogleAutocomplete(
  query: string,
  suggestions: AddressSuggestion[],
  region: SuggestRegion,
): boolean {
  if (suggestions.length === 0) return false;
  if (region !== "TW") return true;
  const tokens = extractTwAdminTokens(query);
  if (tokens.length === 0) return true;
  const qCity = twCityFromTokens(tokens);
  return suggestions.some((s) => {
    const hay = normalizeTwAdminText(`${s.label} ${s.secondary ?? ""}`);
    if (qCity && hay.includes(qCity)) return true;
    if (!qCity && tokens.some((t) => hay.includes(normalizeTwAdminText(t)))) return true;
    return false;
  });
}

/**
 * Autocomplete suggestions for address entry.
 * CA/BC → BC Geocoder first.
 * TW + Google key → Autocomplete (if reasonable) → Geocode → filtered Nominatim.
 * US/OTHER → Google Autocomplete → Nominatim → Geocode fallback.
 * Never invent addresses — empty list if all upstreams miss.
 */
export async function suggestAddresses(
  query: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  if (options?.signal?.aborted) return [];

  const limit = Math.min(Math.max(options?.limit ?? 5, 1), 8);
  const region = detectSuggestRegion(trimmed);
  const signal = options?.signal;

  // Taiwan stays on its own Google/Nominatim ranking — no Metro Vancouver bias.
  if (region === "TW") {
    if (googleKey()) {
      const google = await suggestViaGoogleAutocomplete(trimmed, limit, region, signal);
      if (isReasonableGoogleAutocomplete(trimmed, google, region)) return google;

      const geocode = await suggestViaGoogleGeocode(trimmed, limit, region, signal);
      if (geocode.length > 0) return geocode;
    }
    return suggestViaNominatim(trimmed, limit, region, signal);
  }

  if (region === "US") {
    const google = await suggestViaGoogleAutocomplete(trimmed, limit, region, signal);
    if (google.length > 0) return google;

    const osm = await suggestViaNominatim(trimmed, limit, region, signal);
    if (osm.length > 0) return osm;

    return suggestViaGoogleGeocode(trimmed, limit, region, signal);
  }

  // CA and untagged open-house queries: one-shot Metro Vancouver list.
  // Selecting a row is the object — never a follow-up label geocode.
  const places = await suggestViaPlacesNewCa(trimmed, limit, signal);
  if (places.length > 0) return places;

  return suggestViaPhotonCa(trimmed, limit, signal);
}

async function suggestViaNominatim(
  query: string,
  limit: number,
  region: SuggestRegion,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  // Fetch a few extras so park/admin filters can still leave `limit` rows.
  url.searchParams.set("limit", String(Math.min(limit + 4, 12)));
  if (region === "US") url.searchParams.set("countrycodes", "us");
  if (region === "CA") url.searchParams.set("countrycodes", "ca");
  if (region === "TW") url.searchParams.set("countrycodes", "tw");

  const res = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];

  const rows = (await res.json()) as NominatimResult[];
  return filterNominatimRows(query, rows, region)
    .slice(0, limit)
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
  signal?: AbortSignal,
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

    const res = await fetch(url.toString(), { signal, next: { revalidate: 0 } });
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
  signal?: AbortSignal,
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

    const res = await fetch(url.toString(), { signal, next: { revalidate: 0 } });
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

type PlacePrediction = {
  placeId?: string;
  text?: { text?: string };
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
};

/**
 * Places Autocomplete (New) biased to Metro Vancouver, then Place Details
 * for the same place id so lat/lng/formatted are the selection itself.
 */
async function suggestViaPlacesNewCa(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const key = googleKey();
  if (!key) return [];

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
      },
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ["ca"],
        locationBias: {
          circle: {
            center: {
              latitude: METRO_VANCOUVER_BIAS.latitude,
              longitude: METRO_VANCOUVER_BIAS.longitude,
            },
            radius: METRO_VANCOUVER_BIAS.radiusMeters,
          },
        },
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      suggestions?: Array<{ placePrediction?: PlacePrediction }>;
    };
    const predictions = (data.suggestions ?? [])
      .map((row) => row.placePrediction)
      .filter((row): row is PlacePrediction => Boolean(row?.placeId && row?.text?.text))
      .slice(0, limit);

    const detailed = await Promise.all(
      predictions.map((prediction) => placeDetailsSuggestion(prediction, key, signal)),
    );
    return detailed.filter((row): row is AddressSuggestion => row != null).slice(0, limit);
  } catch {
    return [];
  }
}

async function placeDetailsSuggestion(
  prediction: PlacePrediction,
  key: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion | null> {
  const placeId = prediction.placeId;
  if (!placeId) return null;
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        signal,
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents",
        },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      id?: string;
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      addressComponents?: Array<{
        longText?: string;
        shortText?: string;
        types?: string[];
      }>;
    };
    const lat = data.location?.latitude;
    const lng = data.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    const pick = (type: string, short = false) => {
      const comp = data.addressComponents?.find((c) => c.types?.includes(type));
      return short ? comp?.shortText : comp?.longText;
    };
    const formatted =
      data.formattedAddress?.trim() || prediction.text?.text?.trim() || "";
    if (!formatted) return null;
    const province = pick("administrative_area_level_1", true);
    const city = pick("locality") || pick("postal_town") || pick("sublocality");
    const country = pick("country");
    const main = prediction.structuredFormat?.mainText?.text?.trim();
    const secondary = prediction.structuredFormat?.secondaryText?.text?.trim();
    const row: AddressSuggestion = {
      id: `gplace:${data.id || placeId}`,
      label: formatted,
      formatted,
      title: main || formatted,
      secondary: secondary && secondary !== main ? secondary : undefined,
      lat,
      lng,
      city: city || undefined,
      province: province || undefined,
      country: country || undefined,
      source: "google",
    };
    if (!isBritishColumbiaAddress(row)) return null;
    return row;
  } catch {
    return null;
  }
}

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    housenumber?: string;
    street?: string;
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    countrycode?: string;
  };
};

/** Photon fallback when Places is unavailable. Still Metro Vancouver biased; no Nominatim. */
async function suggestViaPhotonCa(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  try {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", query);
    url.searchParams.set("lat", String(METRO_VANCOUVER_BIAS.latitude));
    url.searchParams.set("lon", String(METRO_VANCOUVER_BIAS.longitude));
    url.searchParams.set("limit", String(Math.min(limit + 4, 10)));
    const res = await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: PhotonFeature[] };
    const out: AddressSuggestion[] = [];
    for (const feature of data.features ?? []) {
      const props = feature.properties;
      const [lng, lat] = feature.geometry?.coordinates ?? [];
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      if ((props?.countrycode ?? "").toLowerCase() !== "ca") continue;
      const title =
        [props?.housenumber, props?.street].filter(Boolean).join(" ") ||
        props?.name ||
        "";
      const formatted = [title, props?.city, props?.state, props?.country]
        .filter(Boolean)
        .join(", ");
      if (!formatted) continue;
      const row: AddressSuggestion = {
        id: `photon:${props?.osm_id ?? formatted}`,
        label: formatted,
        formatted,
        title: title || formatted,
        secondary: [props?.city, props?.state].filter(Boolean).join(", ") || undefined,
        lat,
        lng,
        city: props?.city,
        province: props?.state,
        country: props?.country,
        source: "photon",
      };
      if (!isBritishColumbiaAddress(row)) continue;
      out.push(row);
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}
