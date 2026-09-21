import { enrichGooglePlaces } from "@/lib/property-intel/google-places";
import { enrichOsmOverpass } from "@/lib/property-intel/osm-overpass";
import { enrichAmenityDistances } from "../distance";
import { jurisdictionKey } from "../jurisdiction";
import { makeEvidence } from "../evidence";
import type { AmenityFact, Evidence, LaneContext, LaneResult } from "../types";
import { runLane, stubLane } from "./types";

/** POI / amenities lane */
export async function runPoiLane(ctx: LaneContext): Promise<LaneResult> {
  const adapterId = jurisdictionKey(ctx.jurisdiction, "poi");
  if (ctx.lat == null || ctx.lng == null) {
    return stubLane("poi", adapterId);
  }

  return runLane("poi", adapterId, ctx, async () => {
    const [places, osm] = await Promise.all([
      enrichGooglePlaces(ctx.lat!, ctx.lng!),
      enrichOsmOverpass(ctx.lat!, ctx.lng!),
    ]);
    const now = ctx.now;
    const out: Evidence<unknown>[] = [];

    const schools =
      places.location.schools?.length
        ? places.location.schools
        : osm.location.schools ?? [];
    const supermarket = places.location.supermarket || osm.location.supermarket || null;
    const park = places.location.park || osm.location.park || null;
    const hospital = places.location.hospital || osm.location.hospital || null;

    const amenityHits = [
      ...(places.location.amenities ?? []),
      ...(osm.location.amenities ?? []),
    ];
    const seen = new Set<string>();
    const amenities: AmenityFact[] = [];
    for (const hit of amenityHits) {
      const key = `${hit.kind}:${hit.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      amenities.push({
        kind: hit.kind,
        name: hit.name,
        minutesWalk: hit.minutesWalk,
        lat: hit.lat ?? null,
        lng: hit.lng ?? null,
        straightLineMeters: hit.straightLineMeters ?? null,
      });
      if (amenities.length >= 30) break;
    }

    const enriched = await enrichAmenityDistances(ctx.lat!, ctx.lng!, amenities);

    const hasGoogle = places.sources.length > 0;
    const sourceType = hasGoogle ? "licensed_vendor" : "public_web";
    const sourceLabel = hasGoogle ? "Google Places" : "OSM Overpass";

    const push = <T>(field: string, value: T | null | undefined) => {
      if (value == null) return;
      if (Array.isArray(value) && value.length === 0) return;
      if (typeof value === "string" && !value.trim()) return;
      out.push(
        makeEvidence({
          lane: "poi",
          field,
          value,
          sourceType,
          sourceId: adapterId,
          sourceLabel,
          fetchedAt: now,
          matchLevel: "neighborhood",
          limitations: "Nearby places, not an attribute of the parcel.",
        }),
      );
    };

    push("schools", schools.length ? schools : null);
    push("supermarket", supermarket);
    push("park", park);
    push("hospital", hospital);
    push("amenities", enriched.length ? enriched : null);
    return out;
  });
}

/** Transit lane — rail + bus (region-neutral labels) */
export async function runTransitLane(ctx: LaneContext): Promise<LaneResult> {
  const adapterId = jurisdictionKey(ctx.jurisdiction, "transit");
  if (ctx.lat == null || ctx.lng == null) {
    return stubLane("transit", adapterId);
  }

  return runLane("transit", adapterId, ctx, async () => {
    const [places, osm] = await Promise.all([
      enrichGooglePlaces(ctx.lat!, ctx.lng!),
      enrichOsmOverpass(ctx.lat!, ctx.lng!),
    ]);
    const now = ctx.now;
    const rail = places.location.skytrain || osm.location.skytrain || null;
    const bus = places.location.bus || osm.location.bus || null;
    const hasGoogle = places.sources.length > 0;
    const out: Evidence<unknown>[] = [];
    const push = (field: string, value: string | null) => {
      if (!value) return;
      out.push(
        makeEvidence({
          lane: "transit",
          field,
          value,
          sourceType: hasGoogle ? "licensed_vendor" : "public_web",
          sourceId: adapterId,
          sourceLabel: hasGoogle ? "Google Places" : "OSM Overpass",
          fetchedAt: now,
          matchLevel: "neighborhood",
        }),
      );
    };
    push("rail", rail);
    push("bus", bus);
    return out;
  });
}

/**
 * Risk lane — CA only when yearBuilt evidence exists elsewhere is not available here;
 * we only emit BC-era tags for CA when we can get year from ATTOM-like sources.
 * Heuristic noise notes are model_estimate and must NOT become found facts via resolve
 * (resolve already strips model_estimate). We skip emitting them as fact evidence.
 */
export async function runRiskLane(ctx: LaneContext): Promise<LaneResult> {
  const adapterId = jurisdictionKey(ctx.jurisdiction, "risk");
  if (ctx.region !== "CA") {
    return stubLane("risk", adapterId);
  }

  return runLane("risk", adapterId, ctx, async () => {
    // Without a licensed year source in CA this phase, do not invent risks.
    return [] as Evidence<unknown>[];
  });
}
