import { makeEvidence } from "./evidence";
import type { PropertyFactsPipelineDeps } from "./interfaces";
import { auditAllProviders, getProviderDef } from "./providers/registry";
import { createProviderAudit } from "./providers/types";
import { createDefaultPipelineDeps } from "./services/defaults";
import { emptyFactCard } from "./resolve";
import type {
  AdapterRun,
  Evidence,
  LaneContext,
  LaneResult,
  PropertyFactCard,
} from "./types";

export type AssemblePropertyFactsInput = {
  address: string;
  /** Skip shared evidence store */
  bypassCache?: boolean;
  /** Injectable pipeline (tests / alternate providers). */
  deps?: Partial<PropertyFactsPipelineDeps>;
};

/**
 * Country-aware orchestrator — depends only on pipeline interfaces.
 * Vendor SDKs are reached via GeocodingProvider / domain provider implementations.
 */
export async function assemblePropertyFacts(
  input: AssemblePropertyFactsInput,
): Promise<PropertyFactCard> {
  const deps = createDefaultPipelineDeps(input.deps);
  const { rawAddress, normalizedQuery, unitHint } = deps.addressNormalization.normalize(
    input.address,
  );
  if (!rawAddress) {
    return emptyFactCard("", "OTHER");
  }

  if (!input.bypassCache) {
    const cached = await deps.evidenceStore.get(normalizedQuery);
    if (cached) return cached;
  }

  const now = new Date().toISOString();
  const providerAudit = createProviderAudit();
  const geo = await deps.geocoding.geocode(normalizedQuery, { audit: providerAudit });
  const country = deps.countryAdapter.resolve(geo);

  // Mark adapter-disabled providers as skipped before lanes run
  for (const id of country.adapter.providers_disabled) {
    const def = getProviderDef(id);
    if (def) {
      providerAudit.markSkipped(
        def,
        def.stubOnly ? "stub_only" : "out_of_region",
      );
    }
  }

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
    region: country.region,
    displayAddress: geo.displayAddress,
    countryCode: geo.countryCode,
    admin1: geo.admin1,
    city: geo.city,
    postalCode: geo.postalCode,
    jurisdiction: country.jurisdiction,
    jurisdictionKey: country.jurisdictionKey,
    lat: geo.lat,
    lng: geo.lng,
    now,
    providerAudit,
  };

  let laneResults: LaneResult[] = [];
  let publicWebEvidence: Evidence<string>[] = [];

  const runAllLanes = () =>
    Promise.all([
      deps.listing.fetchListing(ctx),
      deps.publicRecord.fetchParcel(ctx),
      deps.listing.fetchBuilding(ctx),
      deps.listing.fetchHoa(ctx),
      deps.publicRecord.fetchZoning(ctx),
      deps.poiTransit.fetchPoi(ctx),
      deps.poiTransit.fetchTransit(ctx),
      deps.risk.fetchRisk(ctx),
      deps.listing.fetchMarket(ctx),
    ]);

  if (!geo.geocodeOk) {
    laneResults = await runAllLanes();
  } else {
    const [lanes, publicWeb] = await Promise.all([
      runAllLanes(),
      deps.poiTransit.fetchPublicWeb(ctx),
    ]);
    laneResults = lanes;
    publicWebEvidence = publicWeb;
  }

  const laneEvidence = deps.dataNormalizer.normalizeEvidence(
    laneResults.flatMap((r) => r.evidence),
  );
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

  auditAllProviders(country.region, providerAudit);
  const providerSnap = providerAudit.snapshot();

  const card = deps.conflictResolver.resolve({
    rawAddress,
    region: country.region,
    identityEvidence: deps.dataNormalizer.normalizeEvidence(identityEvidence),
    laneEvidence,
    publicWebEvidence,
    adapterRuns,
    geocodeOk: geo.geocodeOk,
    jurisdictionKey: country.jurisdictionKey,
    assembledAt: now,
    providersUsed: providerSnap.used,
    providersSkipped: providerSnap.skipped,
    countryAdapter: country.adapter,
  });

  // Confidence scorer is used inside resolve via scoreConfidence; keep dep for injection/tests.
  void deps.confidenceScorer;

  if (!input.bypassCache) {
    await deps.evidenceStore.set(normalizedQuery, card);
  }

  return card;
}

/** Project FactCard → legacy PropertyReport via injectable report generator. */
export function projectFactCardViaGenerator(
  card: PropertyFactCard,
  deps?: Partial<PropertyFactsPipelineDeps>,
) {
  return createDefaultPipelineDeps(deps).reportGenerator.fromFactCard(card);
}

/** @deprecated Use projectFactCardViaGenerator or generatePropertyReport(address). */
export function generatePropertyReportFromCard(
  card: PropertyFactCard,
  deps?: Partial<PropertyFactsPipelineDeps>,
) {
  return projectFactCardViaGenerator(card, deps);
}
