/**
 * Thin adapter: existing PropertyFactCard / PropertyReport → DomainPropertyReport.
 */

import type { PropertyFactCard, ProvenancedField } from "@/lib/property-facts/types";
import type { PropertyReport } from "@/lib/property-facts/report-types";
import { projectFactCardToReport } from "@/lib/property-facts/report";
import {
  DOMAIN_SCHEMA_VERSION,
  type Address,
  type Assessment,
  type DataGap,
  type DomainPropertyReport,
  type Evidence,
  type GeocodingResult,
  type HOAOrManagementFee,
  type Listing,
  type NearbyPlace,
  type Property,
  type RiskRecord,
  type TaxRecord,
  type TransitStop,
  type ZoningRecord,
} from "./models";
import { emptyProvenanced, type ProvenancedValue } from "./provenance";
import { DomainPropertyReportSchema } from "./schemas";

function fromField<T>(
  pf: ProvenancedField<T>,
  evidenceId?: string | null,
): ProvenancedValue<T> {
  const ids = evidenceId ? [evidenceId] : [];
  if (pf.status === "not_found" || pf.status === "expired") {
    return {
      ...emptyProvenanced<T>(pf.status),
      limitations: pf.limitations,
    };
  }
  if (pf.status === "conflict") {
    return {
      ...emptyProvenanced<T>("conflict"),
      limitations: pf.limitations,
      confidence: pf.confidence,
      evidenceIds: [],
      source: pf.sourceName ?? pf.sourceLabel ?? pf.sourceType,
    };
  }
  return {
    value: pf.value,
    unit: pf.unit,
    source: pf.sourceName ?? pf.sourceLabel ?? pf.sourceType,
    sourceUrl: pf.sourceUrl ?? pf.rawRef ?? null,
    retrievedAt: pf.retrievedAt ?? pf.fetchedAt,
    effectiveDate: pf.effectiveDate,
    confidence: pf.confidence,
    evidenceIds: ids,
    limitations: pf.limitations,
    status: pf.status,
  };
}

function fromClaimable(
  c: {
    value: string | null;
    status: "found" | "not_found" | "needs_human" | "conflict";
    confidence: number | null;
    evidence_id: string | null;
    basis: string | null;
  },
  unit: string | null = null,
): ProvenancedValue<string> {
  if (c.status === "not_found") return emptyProvenanced("not_found");
  if (c.status === "conflict") {
    return {
      ...emptyProvenanced("conflict"),
      confidence: c.confidence,
      evidenceIds: c.evidence_id ? [c.evidence_id] : [],
      source: c.basis,
      limitations: "Conflicting sources — no automatic pick",
    };
  }
  return {
    value: c.value,
    unit,
    source: c.basis,
    sourceUrl: null,
    retrievedAt: null,
    effectiveDate: null,
    confidence: c.confidence,
    evidenceIds: c.evidence_id ? [c.evidence_id] : [],
    limitations: c.status === "needs_human" ? "Requires human verification" : null,
    status: c.status,
  };
}

function findEvidenceId(report: PropertyReport, field: string): string | null {
  return report.evidence.find((e) => e.field === field)?.id ?? null;
}

function gapsFromReport(report: PropertyReport): DataGap[] {
  return report.risks.data_gaps.map((fieldPath) => {
    const needsHuman = fieldPath.endsWith(":needs_human");
    const conflict = fieldPath.endsWith(":conflict");
    return {
      fieldPath: needsHuman
        ? fieldPath.replace(/:needs_human$/, "")
        : conflict
          ? fieldPath.replace(/:conflict$/, "")
          : fieldPath,
      reason: needsHuman
        ? ("needs_human" as const)
        : conflict
          ? ("conflict" as const)
          : ("not_found" as const),
      note: null,
    };
  });
}

function mapEvidence(report: PropertyReport): Evidence[] {
  return report.evidence.map((e) => ({
    id: e.id,
    field: e.field,
    value: e.value,
    unit: e.unit,
    source: e.source_name ?? e.source_type,
    sourceUrl: e.source_url,
    retrievedAt: e.retrieved_at,
    effectiveDate: e.effective_date,
    confidence: e.confidence,
    evidence: e.evidence,
    limitations: e.limitations,
    status: e.status,
    matchLevel: e.match_level,
  }));
}

function buildAddress(card: PropertyFactCard, report: PropertyReport): Address {
  const id = (field: string) => findEvidenceId(report, field);
  return {
    input: card.identity.rawAddress,
    normalized: fromField(card.identity.normalizedAddress, id("normalized_address")),
    display: fromField(card.identity.displayAddress, id("display_address")),
    components: {
      streetNumber: fromField(card.identity.streetNumber, id("street_number")),
      streetName: fromField(card.identity.streetName, id("street_name")),
      city: fromField(card.identity.city),
      admin1: fromField(card.identity.admin1),
      county: fromField(card.identity.county),
      district: fromField(card.identity.district),
      section: fromField(card.identity.section),
      doorplate: fromField(card.identity.doorplate),
      postalCode: fromField(card.identity.postalCode),
      country: fromField(card.identity.countryCode, id("country")),
    },
    placeId: fromField(card.identity.placeId, id("place_id")),
    jurisdictionKey: card.meta.jurisdictionKey
      ? {
          ...emptyProvenanced<string>("found"),
          value: card.meta.jurisdictionKey,
          status: "found",
          source: "country_adapter",
        }
      : emptyProvenanced("not_found"),
    unitHint: fromField(card.identity.unitHint),
  };
}

function buildGeocoding(card: PropertyFactCard, report: PropertyReport): GeocodingResult {
  const id = (field: string) => findEvidenceId(report, field);
  return {
    lat: fromField(card.identity.lat, id("lat")),
    lng: fromField(card.identity.lng, id("lng")),
    provider: card.meta.adapterRuns[0]
      ? {
          ...emptyProvenanced<string>("found"),
          value: card.meta.adapterRuns[0].sourceId,
          status: "found",
          source: card.meta.adapterRuns[0].sourceId,
        }
      : emptyProvenanced("not_found"),
    matchLevel: card.meta.match
      ? {
          ...emptyProvenanced<string>("found"),
          value: card.meta.match.level,
          status: "found",
          source: "address_match",
        }
      : emptyProvenanced("not_found"),
    displayAddress: fromField(card.identity.displayAddress, id("display_address")),
    geocodeOk: card.meta.geocodeOk,
  };
}

function buildProperty(card: PropertyFactCard, report: PropertyReport): Property {
  const id = (field: string) => findEvidenceId(report, field);
  return {
    propertyType: fromField(card.listing.propertyType, id("property_type")),
    yearBuilt: fromField(card.building.yearBuilt, id("year_built")),
    buildingArea: fromField(card.listing.area, id("building_area")),
    lotArea: emptyProvenanced("not_found"),
    bedrooms: fromField(card.listing.beds, id("bedrooms")),
    bathrooms: fromField(card.listing.baths, id("bathrooms")),
    parking: emptyProvenanced("not_found"),
    condition: emptyProvenanced("not_found"),
    parcelId: fromField(
      card.parcel.parcelId.status !== "not_found" ? card.parcel.parcelId : card.parcel.pid,
    ),
    buildingId: emptyProvenanced("not_found"),
  };
}

function buildListing(card: PropertyFactCard, report: PropertyReport): Listing {
  const id = (field: string) => findEvidenceId(report, field);
  return {
    listingId: fromField(card.identity.listingId),
    price: fromClaimable(report.costs.listing_price),
    status: emptyProvenanced("not_found"),
    propertyType: fromField(card.listing.propertyType, id("property_type")),
    bedrooms: fromField(card.listing.beds, id("bedrooms")),
    bathrooms: fromField(card.listing.baths, id("bathrooms")),
    area: fromField(card.listing.area, id("building_area")),
    currency: fromField(card.market.currency, id("currency")),
  };
}

function buildHoa(card: PropertyFactCard, report: PropertyReport): HOAOrManagementFee {
  const fee =
    card.hoa.managementFee.status !== "not_found"
      ? card.hoa.managementFee
      : card.hoa.strataFee;
  const amount = fromClaimable(report.costs.hoa_or_management_fee, fee.unit);
  const kindValue =
    card.hoa.strataFee.status !== "not_found"
      ? "strata"
      : card.hoa.managementFee.status !== "not_found"
        ? "management"
        : null;
  return {
    amount,
    period: emptyProvenanced("not_found"),
    feeKind: kindValue
      ? {
          ...emptyProvenanced<"hoa" | "strata" | "condo" | "management" | "other">("found"),
          value: kindValue,
          status: fee.status === "needs_human" ? "needs_human" : "found",
          evidenceIds: amount.evidenceIds,
          source: fee.sourceType,
        }
      : emptyProvenanced("not_found"),
    currency: fee.unit
      ? {
          ...emptyProvenanced<string>(fee.status === "not_found" ? "not_found" : "found"),
          value: fee.unit,
          status: fee.status === "not_found" ? "not_found" : "found",
          evidenceIds: amount.evidenceIds,
        }
      : emptyProvenanced("not_found"),
  };
}

function buildTax(report: PropertyReport): TaxRecord {
  return {
    amount: fromClaimable(report.costs.property_tax),
    taxYear: emptyProvenanced("not_found"),
    jurisdiction: emptyProvenanced("not_found"),
    currency: emptyProvenanced("not_found"),
  };
}

function buildAssessment(card: PropertyFactCard): Assessment {
  return {
    assessedValue: fromField(card.parcel.assessedValue),
    assessedYear: emptyProvenanced("not_found"),
    rollNumber: fromField(card.parcel.rollNumber),
    currency: emptyProvenanced("not_found"),
  };
}

function buildZoning(card: PropertyFactCard, report: PropertyReport): ZoningRecord {
  const id = findEvidenceId(report, "zoning");
  return {
    code: fromField(card.zoning.zoningCode, id),
    label: fromField(card.zoning.zoningLabel, id),
    landUse: fromField(card.zoning.landUse),
  };
}

function buildNearby(report: PropertyReport): NearbyPlace[] {
  const groups = [
    ...report.location.schools,
    ...report.location.shopping,
    ...report.location.dining,
    ...report.location.medical,
    ...report.location.parks,
  ];
  return groups.map((item) => {
    const ev = item.evidence_id ? [item.evidence_id] : [];
    const wrapNum = (v: number | null): ProvenancedValue<number> =>
      v == null
        ? emptyProvenanced("not_found")
        : {
            ...emptyProvenanced<number>("found"),
            value: v,
            status: "found",
            evidenceIds: ev,
          };
    return {
      name: {
        ...emptyProvenanced<string>("found"),
        value: item.name,
        status: "found",
        evidenceIds: ev,
      },
      kind: {
        ...emptyProvenanced<string>("found"),
        value: item.kind,
        status: "found",
        evidenceIds: ev,
      },
      straightLineMeters: wrapNum(item.straight_line_meters),
      walkingMinutes: wrapNum(item.walking_minutes),
      drivingMinutes: wrapNum(item.driving_minutes),
      peakDrivingMinutes: wrapNum(item.peak_driving_minutes),
    };
  });
}

function buildTransit(report: PropertyReport): TransitStop[] {
  return report.location.transit.map((item) => {
    const ev = item.evidence_id ? [item.evidence_id] : [];
    const wrapNum = (v: number | null): ProvenancedValue<number> =>
      v == null
        ? emptyProvenanced("not_found")
        : {
            ...emptyProvenanced<number>("found"),
            value: v,
            status: "found",
            evidenceIds: ev,
          };
    return {
      name: {
        ...emptyProvenanced<string>("found"),
        value: item.name,
        status: "found",
        evidenceIds: ev,
      },
      mode: {
        ...emptyProvenanced<string>("found"),
        value: item.kind,
        status: "found",
        evidenceIds: ev,
      },
      straightLineMeters: wrapNum(item.straight_line_meters),
      walkingMinutes: wrapNum(item.walking_minutes),
      drivingMinutes: wrapNum(item.driving_minutes),
    };
  });
}

function buildRisks(card: PropertyFactCard, report: PropertyReport): RiskRecord[] {
  const rows: RiskRecord[] = [];
  const push = (
    kind: "flood" | "earthquake" | "wildfire" | "noise" | "other",
    pf: ProvenancedField<string>,
    field: string,
  ) => {
    if (pf.status === "not_found" || pf.status === "expired") return;
    const id = findEvidenceId(report, field);
    rows.push({
      kind: {
        ...emptyProvenanced<"flood" | "earthquake" | "wildfire" | "noise" | "other">("found"),
        value: kind,
        status: "found",
        evidenceIds: id ? [id] : [],
      },
      levelOrNote: fromField(pf, id),
    });
  };
  push("flood", card.risk.flood, "flood");
  push("earthquake", card.risk.earthquake, "earthquake");
  push("wildfire", card.risk.wildfire, "wildfire");
  push("noise", card.risk.noiseNote, "noise");
  return rows;
}

/**
 * Project FactCard → validated domain PropertyReport.
 * Throws ZodError if contract violated (callers may catch / safeParse).
 */
export function toDomainPropertyReport(card: PropertyFactCard): DomainPropertyReport {
  const legacy = projectFactCardToReport(card);
  return toDomainFromLegacy(card, legacy);
}

export function toDomainFromLegacy(
  card: PropertyFactCard,
  report: PropertyReport,
): DomainPropertyReport {
  const adapter = card.meta.countryAdapter
    ? {
        id: card.meta.countryAdapter.id,
        units: {
          area: card.meta.countryAdapter.units.area,
          currency: card.meta.countryAdapter.units.currency,
        },
        availableDataTypes: card.meta.countryAdapter.available_data_types,
        providersPreferred: card.meta.countryAdapter.providers_preferred,
        providersDisabled: card.meta.countryAdapter.providers_disabled,
        structuralGaps: card.meta.countryAdapter.structural_gaps,
        legalNotices: card.meta.countryAdapter.legal_notices,
        feeLabel: card.meta.countryAdapter.fee_label,
        feeLabelZh: card.meta.countryAdapter.fee_label_zh,
      }
    : null;

  const domain: DomainPropertyReport = {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    address: buildAddress(card, report),
    geocoding: buildGeocoding(card, report),
    property: buildProperty(card, report),
    listing: buildListing(card, report),
    transactions: [],
    permits: [],
    assessment: buildAssessment(card),
    tax: buildTax(report),
    hoa: buildHoa(card, report),
    zoning: buildZoning(card, report),
    nearby: buildNearby(report),
    transit: buildTransit(report),
    comparables: [],
    risks: buildRisks(card, report),
    evidence: mapEvidence(report),
    dataGaps: gapsFromReport(report),
    adapter,
    disclaimer: report.disclaimer,
    narrativeSummaryZh: report.narrative?.summary_zh ?? null,
  };

  return DomainPropertyReportSchema.parse(domain);
}

export function safeToDomainPropertyReport(card: PropertyFactCard) {
  try {
    return { ok: true as const, report: toDomainPropertyReport(card) };
  } catch (error) {
    return { ok: false as const, error };
  }
}
