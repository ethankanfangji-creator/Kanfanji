import { walkingMinutesFromMeters } from "@/lib/property-intel/types";
import type { AmenityFact } from "./types";

function googleKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    null
  );
}

type MatrixMode = "walking" | "driving" | "driving_peak";

/**
 * Enrich amenity distances. Straight-line + walking minutes always available
 * when lat/lng exist. Driving / peak commute require Distance Matrix; otherwise null.
 */
export async function enrichAmenityDistances(
  originLat: number,
  originLng: number,
  amenities: AmenityFact[],
): Promise<AmenityFact[]> {
  if (!amenities.length) return amenities;

  const withStraight = amenities.map((a) => {
    if (a.lat == null || a.lng == null) return a;
    if (a.straightLineMeters != null) return a;
    const meters = haversine(originLat, originLng, a.lat, a.lng);
    return {
      ...a,
      straightLineMeters: Math.round(meters),
      minutesWalk: a.minutesWalk ?? walkingMinutesFromMeters(meters),
    };
  });

  const key = googleKey();
  const destinations = withStraight.filter((a) => a.lat != null && a.lng != null).slice(0, 12);
  if (!key || destinations.length === 0) {
    return withStraight.map((a) => ({
      ...a,
      drivingMinutes: a.drivingMinutes ?? null,
      peakDrivingMinutes: a.peakDrivingMinutes ?? null,
    }));
  }

  const [walking, driving, peak] = await Promise.all([
    distanceMatrix(originLat, originLng, destinations, "walking", key),
    distanceMatrix(originLat, originLng, destinations, "driving", key),
    distanceMatrix(originLat, originLng, destinations, "driving_peak", key),
  ]);

  return withStraight.map((a) => {
    const idx = destinations.findIndex((d) => d.name === a.name && d.kind === a.kind);
    if (idx < 0) {
      return {
        ...a,
        drivingMinutes: null,
        peakDrivingMinutes: null,
      };
    }
    return {
      ...a,
      minutesWalk: walking[idx] ?? a.minutesWalk,
      drivingMinutes: driving[idx] ?? null,
      peakDrivingMinutes: peak[idx] ?? null,
    };
  });
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function distanceMatrix(
  originLat: number,
  originLng: number,
  destinations: AmenityFact[],
  mode: MatrixMode,
  key: string,
): Promise<Array<number | null>> {
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
    url.searchParams.set("origins", `${originLat},${originLng}`);
    url.searchParams.set(
      "destinations",
      destinations.map((d) => `${d.lat},${d.lng}`).join("|"),
    );
    url.searchParams.set("key", key);
    if (mode === "walking") {
      url.searchParams.set("mode", "walking");
    } else {
      url.searchParams.set("mode", "driving");
      url.searchParams.set("departure_time", mode === "driving_peak" ? "now" : "now");
      if (mode === "driving_peak") {
        url.searchParams.set("traffic_model", "best_guess");
      }
    }

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return destinations.map(() => null);
    const data = (await res.json()) as {
      rows?: Array<{
        elements?: Array<{
          status?: string;
          duration?: { value?: number };
          duration_in_traffic?: { value?: number };
        }>;
      }>;
    };
    const elements = data.rows?.[0]?.elements ?? [];
    return destinations.map((_, i) => {
      const el = elements[i];
      if (!el || el.status !== "OK") return null;
      const seconds =
        mode === "driving_peak"
          ? el.duration_in_traffic?.value ?? el.duration?.value
          : el.duration?.value;
      if (seconds == null || !Number.isFinite(seconds)) return null;
      return Math.max(1, Math.round(seconds / 60));
    });
  } catch {
    return destinations.map(() => null);
  }
}
