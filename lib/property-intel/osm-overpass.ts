import {
  haversineMeters,
  walkingMinutesFromMeters,
  type AmenityHit,
  type PropertyIntelLocation,
} from "./types";

type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

function classify(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null;
  if (tags.railway === "station" || tags.station === "subway" || tags.subway === "yes") {
    return "transit";
  }
  if (tags.highway === "bus_stop" || tags.amenity === "bus_station") return "bus";
  if (tags.amenity === "school" || tags.amenity === "kindergarten") return "school";
  if (tags.shop === "supermarket" || tags.shop === "convenience") return "supermarket";
  if (tags.leisure === "park" || tags.leisure === "garden") return "park";
  if (tags.amenity === "hospital" || tags.amenity === "clinic") return "hospital";
  return null;
}

function elementName(tags: Record<string, string> | undefined): string {
  return tags?.name || tags?.["name:en"] || tags?.["name:zh"] || "未命名";
}

function elementCoords(el: OsmElement): { lat: number; lng: number } | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

/**
 * Free OSM Overpass nearby amenities — fills gaps when Google Places is unavailable.
 */
export async function enrichOsmOverpass(
  lat: number,
  lng: number,
): Promise<{ location: Partial<PropertyIntelLocation>; sources: string[] }> {
  const query = `
[out:json][timeout:18];
(
  node(around:1800,${lat},${lng})["railway"="station"];
  node(around:1800,${lat},${lng})["station"="subway"];
  node(around:1200,${lat},${lng})["highway"="bus_stop"];
  node(around:1500,${lat},${lng})["amenity"="school"];
  node(around:1500,${lat},${lng})["shop"="supermarket"];
  node(around:1500,${lat},${lng})["leisure"="park"];
  node(around:2000,${lat},${lng})["amenity"="hospital"];
  way(around:1800,${lat},${lng})["railway"="station"];
  way(around:1500,${lat},${lng})["leisure"="park"];
);
out center 40;
`.trim();

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
        "User-Agent": "KanFangJi/0.1 (open-house recorder; contact@localhost)",
      },
      body: `data=${encodeURIComponent(query)}`,
      next: { revalidate: 0 },
    });
    if (!res.ok) return { location: {}, sources: [] };
    const data = (await res.json()) as { elements?: OsmElement[] };
    const amenities: AmenityHit[] = [];
    const schools: string[] = [];
    let skytrain: string | null = null;
    let bus: string | null = null;
    let supermarket: string | null = null;
    let park: string | null = null;
    let hospital: string | null = null;

    const best: Record<string, { name: string; meters: number }> = {};

    for (const el of data.elements ?? []) {
      const kind = classify(el.tags);
      const coords = elementCoords(el);
      if (!kind || !coords) continue;
      const name = elementName(el.tags);
      const meters = haversineMeters(lat, lng, coords.lat, coords.lng);
      const minutes = walkingMinutesFromMeters(meters);
      amenities.push({
        kind,
        name,
        minutesWalk: minutes,
        source: "OSM Overpass",
      });
      if (kind === "school" && schools.length < 3) schools.push(name);
      const prev = best[kind];
      if (!prev || meters < prev.meters) best[kind] = { name, meters };
    }

    if (best.transit) {
      skytrain = `${best.transit.name} ${walkingMinutesFromMeters(best.transit.meters)}分`;
    }
    if (best.bus) {
      bus = `${best.bus.name} ${walkingMinutesFromMeters(best.bus.meters)}分`;
    }
    if (best.supermarket) {
      supermarket = `${best.supermarket.name} ${walkingMinutesFromMeters(best.supermarket.meters)}分`;
    }
    if (best.park) {
      park = `${best.park.name} ${walkingMinutesFromMeters(best.park.meters)}分`;
    }
    if (best.hospital) {
      hospital = `${best.hospital.name} ${walkingMinutesFromMeters(best.hospital.meters)}分`;
    }

    if (amenities.length === 0) return { location: {}, sources: [] };

    return {
      location: {
        skytrain,
        bus,
        schools,
        supermarket,
        park,
        hospital,
        amenities: amenities.slice(0, 24),
        lat,
        lng,
      },
      sources: ["OpenStreetMap Overpass"],
    };
  } catch {
    return { location: {}, sources: [] };
  }
}
