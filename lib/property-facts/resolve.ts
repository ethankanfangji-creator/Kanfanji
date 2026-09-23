import { claimCannotConfirm, scoreConfidence } from "./confidence";
import { decideEvidenceWinner, isEstimatedSource } from "./conflict-policy";
import {
  conflictField,
  fieldStatusFromEvidence,
  foundField,
  isExpired,
  needsHumanField,
  notFoundField,
} from "./evidence";
import { buildAddressMatch } from "./match";
import type {
  CoverageSummary,
  Evidence,
  LaneId,
  PropertyFactBuilding,
  PropertyFactCard,
  PropertyFactHoa,
  PropertyFactIdentity,
  PropertyFactListing,
  PropertyFactMarket,
  PropertyFactParcel,
  PropertyFactPoi,
  PropertyFactRisk,
  PropertyFactTransit,
  PropertyFactZoning,
  PropertyRegion,
  ProvenancedField,
  AdapterRun,
} from "./types";

function resolveField<T>(
  evidence: Evidence<unknown>[],
  field: string,
  opts?: { allowNeedsHuman?: boolean },
): ProvenancedField<T> {
  const forField = evidence.filter((e) => e.field === field) as Evidence<T>[];
  const status = fieldStatusFromEvidence(forField);
  if (status === "not_found") {
    if (opts?.allowNeedsHuman) {
      const human = forField.find((e) => e.sourceClass === "public_web");
      if (human) {
        return needsHumanField<T>({
          rawRef: human.rawRef ?? String(human.value).slice(0, 200),
          sourceLabel: human.sourceLabel,
        });
      }
    }
    return notFoundField<T>();
  }
  if (status === "expired") {
    return {
      ...notFoundField<T>(),
      status: "expired",
    };
  }

  const estimates = forField.filter(
    (e) => !isExpired(e.expiresAt) && isEstimatedSource(e.sourceType),
  );
  const live = forField
    .filter((e) => !isExpired(e.expiresAt))
    .filter((e) => !isEstimatedSource(e.sourceType) && e.sourceType !== "model_estimate");

  if (live.length === 0) {
    if (estimates.length > 0) {
      const est = estimates[0]!;
      return needsHumanField<T>({
        value: est.value,
        sourceType: est.sourceType,
        sourceLabel: est.sourceLabel,
        rawRef: est.rawRef ?? est.evidence,
        sourceUrl: est.sourceUrl,
        confidence: scoreConfidence({
          sourceType: est.sourceType,
          matchLevel: est.matchLevel,
          retrievedAt: est.retrievedAt,
          effectiveDate: est.effectiveDate,
        }),
        limitations:
          est.limitations ?? "Estimated value — not a confirmed property fact.",
        evidence: est.evidence,
        unit: est.unit,
        matchLevel: est.matchLevel,
        retrievedAt: est.retrievedAt,
        effectiveDate: est.effectiveDate,
        estimated: true,
        conflicts: estimates.slice(1),
      });
    }
    return notFoundField<T>();
  }

  const decision = decideEvidenceWinner(live);

  if (decision.kind === "empty") {
    return notFoundField<T>();
  }

  if (decision.kind === "unresolved_conflict") {
    return conflictField<T>({
      candidates: decision.candidates,
      confidence: scoreConfidence({
        sourceType: decision.candidates[0]!.sourceType,
        matchLevel: decision.candidates[0]!.matchLevel,
        retrievedAt: decision.candidates[0]!.retrievedAt,
        effectiveDate: decision.candidates[0]!.effectiveDate,
        conflict: true,
      }),
    });
  }

  const { winner, conflicts } = decision;
  const confidence = scoreConfidence({
    sourceType: winner.sourceType,
    matchLevel: winner.matchLevel,
    retrievedAt: winner.retrievedAt,
    effectiveDate: winner.effectiveDate,
    conflict: conflicts.length > 0,
  });

  if (claimCannotConfirm(winner.sourceType)) {
    return needsHumanField<T>({
      value: winner.value,
      sourceType: winner.sourceType,
      sourceLabel: winner.sourceLabel,
      rawRef: winner.rawRef ?? winner.evidence,
      sourceUrl: winner.sourceUrl,
      confidence,
      limitations:
        winner.limitations ??
        (winner.sourceType === "listing_claim"
          ? "房源宣稱，未經官方或管理文件確認"
          : "間接或社區級資料，不能當成這戶的官方值"),
      evidence: winner.evidence,
      unit: winner.unit,
      matchLevel: winner.matchLevel,
      retrievedAt: winner.retrievedAt,
      effectiveDate: winner.effectiveDate,
      estimated: isEstimatedSource(winner.sourceType),
      conflicts: conflicts.length ? conflicts : undefined,
    });
  }

  return foundField(winner.value, {
    sourceClass: winner.sourceClass,
    sourceType: winner.sourceType,
    sourceId: winner.sourceId,
    sourceLabel: winner.sourceLabel,
    fetchedAt: winner.retrievedAt,
    expiresAt: winner.expiresAt,
    confidence,
    unit: winner.unit,
    sourceUrl: winner.sourceUrl,
    effectiveDate: winner.effectiveDate,
    matchLevel: winner.matchLevel,
    evidence: winner.evidence,
    limitations: winner.limitations,
    conflicts: conflicts.length ? conflicts : undefined,
    rawRef: winner.rawRef ?? null,
    estimated: false,
  });
}

function emptyIdentity(rawAddress: string): PropertyFactIdentity {
  return {
    rawAddress,
    normalizedAddress: notFoundField(),
    displayAddress: notFoundField(),
    countryCode: notFoundField(),
    admin1: notFoundField(),
    county: notFoundField(),
    city: notFoundField(),
    municipality: notFoundField(),
    district: notFoundField(),
    section: notFoundField(),
    doorplate: notFoundField(),
    postalCode: notFoundField(),
    streetNumber: notFoundField(),
    streetName: notFoundField(),
    placeId: notFoundField(),
    listingId: notFoundField(),
    lat: notFoundField(),
    lng: notFoundField(),
    unitHint: notFoundField(),
  };
}

function emptyListing(): PropertyFactListing {
  return {
    propertyType: notFoundField(),
    beds: notFoundField(),
    baths: notFoundField(),
    area: notFoundField(),
    listingUrl: notFoundField(),
    notes: notFoundField(),
  };
}

function emptyParcel(): PropertyFactParcel {
  return {
    parcelId: notFoundField(),
    pid: notFoundField(),
    planNumber: notFoundField(),
    lotNumber: notFoundField(),
    rollNumber: notFoundField(),
    legalDescription: notFoundField(),
    assessedValue: notFoundField(),
    propertyTax: notFoundField(),
  };
}

function emptyBuilding(): PropertyFactBuilding {
  return {
    yearBuilt: notFoundField(),
    buildingType: notFoundField(),
    permits: notFoundField(),
    inspections: notFoundField(),
  };
}

function emptyHoa(): PropertyFactHoa {
  return {
    managementFee: notFoundField(),
    strataFee: notFoundField(),
    hoaName: notFoundField(),
  };
}

function emptyZoning(): PropertyFactZoning {
  return {
    zoningCode: notFoundField(),
    zoningLabel: notFoundField(),
    zoningCategory: notFoundField(),
    landUse: notFoundField(),
    covenantHint: notFoundField(),
    easementHint: notFoundField(),
  };
}

function emptyPoi(): PropertyFactPoi {
  return {
    schools: notFoundField(),
    supermarket: notFoundField(),
    park: notFoundField(),
    hospital: notFoundField(),
    amenities: notFoundField(),
  };
}

function emptyTransit(): PropertyFactTransit {
  return {
    rail: notFoundField(),
    bus: notFoundField(),
  };
}

function emptyRisk(): PropertyFactRisk {
  return {
    items: notFoundField(),
    noiseNote: notFoundField(),
    flood: notFoundField(),
    earthquake: notFoundField(),
    wildfire: notFoundField(),
  };
}

function emptyMarket(): PropertyFactMarket {
  return {
    currency: notFoundField(),
    lastSold: notFoundField(),
    avgUnitPrice: notFoundField(),
    priceRange: notFoundField(),
    rentHint: notFoundField(),
  };
}

function countCoverage(card: PropertyFactCard): CoverageSummary {
  const summary: CoverageSummary = {
    found: 0,
    notFound: 0,
    needsHuman: 0,
    expired: 0,
  };

  const walk = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    if (
      "status" in obj &&
      typeof (obj as ProvenancedField<unknown>).status === "string" &&
      "value" in obj
    ) {
      const s = (obj as ProvenancedField<unknown>).status;
      if (s === "found") summary.found += 1;
      else if (s === "not_found") summary.notFound += 1;
      else if (s === "needs_human" || s === "conflict") summary.needsHuman += 1;
      else if (s === "expired") summary.expired += 1;
      return;
    }
    for (const v of Object.values(obj as Record<string, unknown>)) {
      walk(v);
    }
  };

  walk(card.identity);
  walk(card.listing);
  walk(card.parcel);
  walk(card.building);
  walk(card.hoa);
  walk(card.zoning);
  walk(card.poi);
  walk(card.transit);
  walk(card.risk);
  walk(card.market);
  return summary;
}

function byLane(all: Evidence<unknown>[], lane: LaneId): Evidence<unknown>[] {
  return all.filter((e) => e.lane === lane);
}

/**
 * Confidence scorer + conflict resolver.
 * model_estimate evidence never becomes a found fact value.
 */
export function resolveFactCard(input: {
  rawAddress: string;
  region: PropertyRegion;
  identityEvidence: Evidence<unknown>[];
  laneEvidence: Evidence<unknown>[];
  publicWebEvidence: Evidence<string>[];
  adapterRuns: AdapterRun[];
  geocodeOk: boolean;
  jurisdictionKey?: string | null;
  assembledAt?: string;
  providersUsed?: Array<{ id: string; kind: string; auth_scope: string }>;
  providersSkipped?: Array<{ id: string; reason: string }>;
  countryAdapter?: import("./adapters/country/types").CountryAdapterSnapshot | null;
}): PropertyFactCard {
  const assembledAt = input.assembledAt ?? new Date().toISOString();
  const idEv = input.identityEvidence;
  const all = input.laneEvidence;

  const card: PropertyFactCard = {
    region: input.region,
    identity: {
      rawAddress: input.rawAddress,
      normalizedAddress: resolveField(idEv, "normalizedAddress"),
      displayAddress: resolveField(idEv, "displayAddress"),
      countryCode: resolveField(idEv, "countryCode"),
      admin1: resolveField(idEv, "admin1"),
      county: resolveField(idEv, "county"),
      city: resolveField(idEv, "city"),
      municipality: resolveField(idEv, "municipality"),
      district: resolveField(idEv, "district"),
      section: resolveField(idEv, "section"),
      doorplate: resolveField(idEv, "doorplate"),
      postalCode: resolveField(idEv, "postalCode"),
      streetNumber: resolveField(idEv, "streetNumber"),
      streetName: resolveField(idEv, "streetName"),
      placeId: resolveField(idEv, "placeId"),
      listingId: resolveField(idEv, "listingId"),
      lat: resolveField(idEv, "lat"),
      lng: resolveField(idEv, "lng"),
      unitHint: resolveField(idEv, "unitHint"),
    },
    listing: {
      propertyType: resolveField(byLane(all, "listing"), "propertyType"),
      beds: resolveField(byLane(all, "listing"), "beds"),
      baths: resolveField(byLane(all, "listing"), "baths"),
      area: resolveField(byLane(all, "listing"), "area"),
      listingUrl: resolveField(byLane(all, "listing"), "listingUrl"),
      notes: resolveField(byLane(all, "listing"), "notes", { allowNeedsHuman: true }),
    },
    parcel: {
      parcelId: resolveField(byLane(all, "parcel"), "parcelId"),
      pid: resolveField(byLane(all, "parcel"), "pid"),
      planNumber: resolveField(byLane(all, "parcel"), "planNumber"),
      lotNumber: resolveField(byLane(all, "parcel"), "lotNumber"),
      rollNumber: resolveField(byLane(all, "parcel"), "rollNumber"),
      legalDescription: resolveField(byLane(all, "parcel"), "legalDescription"),
      assessedValue: resolveField(byLane(all, "parcel"), "assessedValue"),
      propertyTax: resolveField(byLane(all, "parcel"), "propertyTax"),
    },
    building: {
      yearBuilt: resolveField(byLane(all, "building"), "yearBuilt"),
      buildingType: resolveField(byLane(all, "building"), "buildingType"),
      permits: resolveField(byLane(all, "building"), "permits"),
      inspections: resolveField(byLane(all, "building"), "inspections"),
    },
    hoa: {
      managementFee: resolveField(byLane(all, "hoa"), "managementFee"),
      strataFee: resolveField(byLane(all, "hoa"), "strataFee"),
      hoaName: resolveField(byLane(all, "hoa"), "hoaName"),
    },
    zoning: {
      zoningCode: resolveField(byLane(all, "zoning"), "zoningCode"),
      zoningLabel: resolveField(byLane(all, "zoning"), "zoningLabel"),
      zoningCategory: resolveField(byLane(all, "zoning"), "zoningCategory"),
      landUse: resolveField(byLane(all, "zoning"), "landUse"),
      covenantHint: resolveField(byLane(all, "zoning"), "covenantHint"),
      easementHint: resolveField(byLane(all, "zoning"), "easementHint"),
    },
    poi: {
      schools: resolveField(byLane(all, "poi"), "schools"),
      supermarket: resolveField(byLane(all, "poi"), "supermarket"),
      park: resolveField(byLane(all, "poi"), "park"),
      hospital: resolveField(byLane(all, "poi"), "hospital"),
      amenities: resolveField(byLane(all, "poi"), "amenities"),
    },
    transit: {
      rail: resolveField(byLane(all, "transit"), "rail"),
      bus: resolveField(byLane(all, "transit"), "bus"),
    },
    risk: {
      items: resolveField(byLane(all, "risk"), "items"),
      noiseNote: resolveField(byLane(all, "risk"), "noiseNote"),
      flood: resolveField(byLane(all, "risk"), "flood"),
      earthquake: resolveField(byLane(all, "risk"), "earthquake"),
      wildfire: resolveField(byLane(all, "risk"), "wildfire"),
    },
    market: {
      currency: resolveField(byLane(all, "market"), "currency"),
      lastSold: resolveField(byLane(all, "market"), "lastSold"),
      avgUnitPrice: resolveField(byLane(all, "market"), "avgUnitPrice"),
      priceRange: resolveField(byLane(all, "market"), "priceRange"),
      rentHint: resolveField(byLane(all, "market"), "rentHint"),
    },
    meta: {
      assembledAt,
      adapterRuns: input.adapterRuns,
      coverageSummary: { found: 0, notFound: 0, needsHuman: 0, expired: 0 },
      evidenceCount: idEv.length + all.length + input.publicWebEvidence.length,
      geocodeOk: input.geocodeOk,
      jurisdictionKey: input.jurisdictionKey ?? null,
      match: null,
      providersUsed: input.providersUsed,
      providersSkipped: input.providersSkipped,
      countryAdapter: input.countryAdapter ?? null,
    },
    publicWebEvidence: input.publicWebEvidence,
  };

  card.meta.coverageSummary = countCoverage(card);
  card.meta.match = buildAddressMatch(card);
  return card;
}

export function emptyFactCard(rawAddress: string, region: PropertyRegion = "OTHER"): PropertyFactCard {
  const card: PropertyFactCard = {
    region,
    identity: emptyIdentity(rawAddress),
    listing: emptyListing(),
    parcel: emptyParcel(),
    building: emptyBuilding(),
    hoa: emptyHoa(),
    zoning: emptyZoning(),
    poi: emptyPoi(),
    transit: emptyTransit(),
    risk: emptyRisk(),
    market: emptyMarket(),
    meta: {
      assembledAt: new Date().toISOString(),
      adapterRuns: [],
      coverageSummary: { found: 0, notFound: 0, needsHuman: 0, expired: 0 },
      evidenceCount: 0,
      geocodeOk: false,
      jurisdictionKey: null,
      match: null,
    },
    publicWebEvidence: [],
  };
  card.meta.coverageSummary = countCoverage(card);
  card.meta.match = buildAddressMatch(card);
  return card;
}
