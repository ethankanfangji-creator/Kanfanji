import {
  haversineMeters,
  walkingMinutesFromMeters,
  type PropertyIntelLocation,
} from "./types";

type PlaceHit = { name: string; lat: number; lng: number; types: string[] };

function googleKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    null
  );
}

async function nearbySearch(
  lat: number,
  lng: number,
  type: string,
  key: string,
  radius = 2000,
): Promise<PlaceHit[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("type", type);
  url.searchParams.set("key", key);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: Array<{
      name?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
      types?: string[];
    }>;
    status?: string;
  };
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    return [];
  }
  return (data.results ?? [])
    .map((row) => {
      const plat = row.geometry?.location?.lat;
      const plng = row.geometry?.location?.lng;
      if (plat == null || plng == null || !row.name) return null;
      return {
        name: row.name,
        lat: plat,
        lng: plng,
        types: row.types ?? [],
      } satisfies PlaceHit;
    })
    .filter(Boolean) as PlaceHit[];
}

function nearestLabel(
  originLat: number,
  originLng: number,
  hits: PlaceHit[],
): string | null {
  if (hits.length === 0) return null;
  let best = hits[0]!;
  let bestM = haversineMeters(originLat, originLng, best.lat, best.lng);
  for (const hit of hits.slice(1)) {
    const m = haversineMeters(originLat, originLng, hit.lat, hit.lng);
    if (m < bestM) {
      best = hit;
      bestM = m;
    }
  }
  const mins = walkingMinutesFromMeters(bestM);
  return `${best.name} ${mins}分`;
}

/** Google Places nearby enrichment. No-op when API key missing. */
export async function enrichGooglePlaces(
  lat: number,
  lng: number,
): Promise<{ location: Partial<PropertyIntelLocation>; sources: string[] }> {
  const key = googleKey();
  if (!key) return { location: {}, sources: [] };

  try {
    const [schools, markets, transit, parks] = await Promise.all([
      nearbySearch(lat, lng, "school", key),
      nearbySearch(lat, lng, "supermarket", key),
      nearbySearch(lat, lng, "transit_station", key, 3000),
      nearbySearch(lat, lng, "park", key),
    ]);

    const schoolNames = schools.slice(0, 3).map((s) => s.name);
    return {
      location: {
        schools: schoolNames,
        supermarket: nearestLabel(lat, lng, markets),
        skytrain: nearestLabel(lat, lng, transit),
        park: nearestLabel(lat, lng, parks),
        lat,
        lng,
      },
      sources: ["Google Places"],
    };
  } catch {
    return { location: { lat, lng }, sources: [] };
  }
}

/** Optional Google Geocode refine — returns lat/lng if BC coords missing. */
export async function geocodeWithGoogle(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const key = googleKey();
  if (!key) return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", key);
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };
    const loc = data.results?.[0]?.geometry?.location;
    if (loc?.lat == null || loc?.lng == null) return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}
