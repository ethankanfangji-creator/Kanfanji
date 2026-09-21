import { geocodeForFacts } from "./geocode";
import { jurisdictionKey } from "./jurisdiction";
import { normalizeAddressQuery } from "./normalize-address";
import { runBuildingLane, runHoaLane, runListingLane, runMarketLane } from "./lanes/listing-building";
import { runParcelLane, runZoningLane } from "./lanes/parcel-zoning";
import { runPoiLane, runRiskLane, runTransitLane } from "./lanes/poi-transit-risk";
import { collectPublicWebEvidence } from "./lanes/public-web";
import { emptyFactCard, resolveFactCard } from "./resolve";
import type {
  AdapterRun,
  Evidence,
  LaneContext,
  LaneResult,
  PropertyFactCard,
} from "./types";
import { makeEvidence } from "./evidence";

export type AssemblePropertyFactsInput = {
  address: string;
  /** Skip shared DB cache */
  bypassCache?: boolean;
};

async function getCached(address: string): Promise<PropertyFactCard | null> {
  try {
    const { getCachedPropertyFacts } = await import("./cache");
    return await getCachedPropertyFacts(address);
  } catch {
    return null;
  }
}

async function setCached(address: string, card: PropertyFactCard): Promise<void> {
  try {
    const { setCachedPropertyFacts } = await import("./cache");
    await setCachedPropertyFacts(address, card);
  } catch {
    // ignore
  }
}

/**
 * Country-specific Data Orchestrator — runs nine lanes in parallel after geocode.
 */
export async function assemblePropertyFacts(
  input: AssemblePropertyFactsInput,
): Promise<PropertyFactCard> {
  const { rawAddress, normalizedQuery, unitHint } = normalizeAddressQuery(input.address);
  if (!rawAddress) {
    return emptyFactCard("", "OTHER");
  }

  if (!input.bypassCache) {
    const cached = await getCached(normalizedQuery);
    if (cached) return cached;
  }

  const now = new Date().toISOString();
  const geo = await geocodeForFacts(normalizedQuery);

  const identityEvidence: Evidence<unknown>[] = [...geo.identityEvidence];
  if (unitHint) {
    identityEvidence.push(
      makeEvidence({
        lane: "listing",
        field: "unitHint",
        value: unitHint,
        sourceClass: "user",
        sourceId: "address_normalizer",
        sourceLabel: "Address Normalizer",
        fetchedAt: now,
        confidenceHint: "medium",
      }),
    );
  }
  // Ensure normalizedAddress always present
  if (!identityEvidence.some((e) => e.field === "normalizedAddress")) {
    identityEvidence.push(
      makeEvidence({
        lane: "listing",
        field: "normalizedAddress",
        value: normalizedQuery,
        sourceClass: "user",
        sourceId: "address_normalizer",
        sourceLabel: "Address Normalizer",
        fetchedAt: now,
        confidenceHint: "high",
      }),
    );
  }

  const ctx: LaneContext = {
    rawAddress,
    normalizedQuery,
    region: geo.region,
    displayAddress: geo.displayAddress,
    countryCode: geo.countryCode,
    admin1: geo.admin1,
    city: geo.city,
    postalCode: geo.postalCode,
    jurisdiction: geo.jurisdiction,
    jurisdictionKey: geo.jurisdictionKey,
    lat: geo.lat,
    lng: geo.lng,
    now,
  };

  // Fix postal from geocode if normalizeAddress returned it — re-read from geo
  // (geocodeForFacts should push postal when available)
  // Enrich geocode with postal from normalizeAddress — update geocode.ts

  let laneResults: LaneResult[] = [];
  let publicWebEvidence: Evidence<string>[] = [];

  if (!geo.geocodeOk) {
    // Degrade: most lanes skip; still record runs as geocode_required stubs via parallel stubs
    laneResults = await Promise.all([
      runListingLane(ctx),
      runParcelLane(ctx),
      runBuildingLane(ctx),
      runHoaLane(ctx),
      runZoningLane(ctx),
      runPoiLane(ctx),
      runTransitLane(ctx),
      runRiskLane(ctx),
      runMarketLane(ctx),
    ]);
  } else {
    const [lanes, publicWeb] = await Promise.all([
      Promise.all([
        runListingLane(ctx),
        runParcelLane(ctx),
        runBuildingLane(ctx),
        runHoaLane(ctx),
        runZoningLane(ctx),
        runPoiLane(ctx),
        runTransitLane(ctx),
        runRiskLane(ctx),
        runMarketLane(ctx),
      ]),
      collectPublicWebEvidence(ctx),
    ]);
    laneResults = lanes;
    publicWebEvidence = publicWeb;
  }

  const laneEvidence: Evidence<unknown>[] = laneResults.flatMap((r) => r.evidence);
  const adapterRuns: AdapterRun[] = [
    {
      lane: "listing",
      sourceId: geo.sourceId ?? "geocode",
      ok: geo.geocodeOk,
      error: geo.geocodeOk ? undefined : "geocode_failed",
      durationMs: 0,
    },
    ...laneResults.flatMap((r) => r.runs),
  ];

  const card = resolveFactCard({
    rawAddress,
    region: geo.region,
    identityEvidence,
    laneEvidence,
    publicWebEvidence,
    adapterRuns,
    geocodeOk: geo.geocodeOk,
    jurisdictionKey: jurisdictionKey(geo.jurisdiction),
    assembledAt: now,
  });

  if (!input.bypassCache) {
    await setCached(normalizedQuery, card);
  }

  return card;
}
