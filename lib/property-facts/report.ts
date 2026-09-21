import type { AmenityFact, PropertyFactCard, ProvenancedField, SourceType } from "./types";
import { notFoundField } from "./evidence";
import {
  PROPERTY_REPORT_DISCLAIMER,
  type PropertyReport,
  type ReportClaimBasis,
  type ReportClaimable,
  type ReportEvidenceItem,
  type ReportLocationItem,
} from "./report-types";

function basisFromSourceType(sourceType: SourceType | null | undefined): ReportClaimBasis {
  if (!sourceType) return null;
  if (sourceType === "model_estimate") return "unverified";
  return sourceType;
}

function pushEvidence<T>(
  list: ReportEvidenceItem[],
  field: string,
  pf: ProvenancedField<T>,
): string | null {
  if (pf.status !== "found" && pf.status !== "needs_human") return null;
  if (pf.status === "needs_human" && pf.value == null && !pf.evidence && !pf.rawRef) {
    return null;
  }
  const id = `ev_${list.length + 1}_${field}`;
  list.push({
    id,
    field,
    value: pf.value,
    unit: pf.unit,
    source_type: pf.sourceType,
    source_name: pf.sourceName ?? pf.sourceLabel,
    source_url: pf.sourceUrl ?? pf.rawRef ?? null,
    retrieved_at: pf.retrievedAt ?? pf.fetchedAt,
    effective_date: pf.effectiveDate,
    confidence: pf.confidence,
    match_level: pf.matchLevel,
    evidence: pf.evidence ?? (typeof pf.rawRef === "string" ? pf.rawRef : null),
    limitations: pf.limitations,
    status: pf.status,
  });
  return id;
}

function foundValue<T>(pf: ProvenancedField<T>): T | null {
  return pf.status === "found" ? pf.value : null;
}

function claimable<T>(
  pf: ProvenancedField<T>,
  field: string,
  evidence: ReportEvidenceItem[],
  gaps: string[],
): ReportClaimable<T> {
  if (pf.status === "not_found" || pf.status === "expired") {
    gaps.push(field);
    return {
      value: null,
      basis: null,
      status: "not_found",
      confidence: null,
      evidence_id: null,
    };
  }
  const evidenceId = pushEvidence(evidence, field, pf);
  if (pf.status === "needs_human") {
    gaps.push(`${field}:needs_human`);
    return {
      value: pf.value,
      basis: basisFromSourceType(pf.sourceType) ?? "listing_claim",
      status: "needs_human",
      confidence: pf.confidence,
      evidence_id: evidenceId,
    };
  }
  return {
    value: pf.value,
    basis: basisFromSourceType(pf.sourceType),
    status: "found",
    confidence: pf.confidence,
    evidence_id: evidenceId,
  };
}

function gapIfMissing<T>(pf: ProvenancedField<T>, field: string, gaps: string[]) {
  if (pf.status === "not_found" || pf.status === "expired") gaps.push(field);
  if (pf.status === "needs_human") gaps.push(`${field}:needs_human`);
}

function amenityItems(
  amenities: AmenityFact[] | null,
  kinds: string[],
  evidenceId: string | null,
): ReportLocationItem[] {
  if (!amenities?.length) return [];
  return amenities
    .filter((a) => kinds.includes(a.kind))
    .map((a) => ({
      name: a.name,
      kind: a.kind,
      minutes_walk: a.minutesWalk,
      evidence_id: evidenceId,
    }));
}

/**
 * Project internal FactCard → external PropertyReport DTO.
 */
export function projectFactCardToReport(card: PropertyFactCard): PropertyReport {
  const evidence: ReportEvidenceItem[] = [];
  const gaps: string[] = [];

  const country =
    card.region === "US" || card.region === "CA" || card.region === "TW"
      ? card.region
      : "OTHER";

  const normalized =
    foundValue(card.identity.normalizedAddress) ||
    foundValue(card.identity.displayAddress) ||
    card.identity.rawAddress;

  pushEvidence(evidence, "normalized_address", card.identity.normalizedAddress);
  pushEvidence(evidence, "display_address", card.identity.displayAddress);
  pushEvidence(evidence, "country", card.identity.countryCode);
  pushEvidence(evidence, "lat", card.identity.lat);
  pushEvidence(evidence, "lng", card.identity.lng);

  gapIfMissing(card.listing.propertyType, "property.property_type", gaps);
  gapIfMissing(card.building.yearBuilt, "property.year_built", gaps);
  gapIfMissing(card.listing.area, "property.building_area", gaps);
  gapIfMissing(card.listing.beds, "property.bedrooms", gaps);
  gapIfMissing(card.listing.baths, "property.bathrooms", gaps);
  gaps.push("property.lot_area", "property.parking", "property.condition");

  pushEvidence(evidence, "property_type", card.listing.propertyType);
  pushEvidence(evidence, "year_built", card.building.yearBuilt);
  pushEvidence(evidence, "building_area", card.listing.area);
  pushEvidence(evidence, "bedrooms", card.listing.beds);
  pushEvidence(evidence, "bathrooms", card.listing.baths);

  const hoaField =
    card.hoa.managementFee.status !== "not_found"
      ? card.hoa.managementFee
      : card.hoa.strataFee;

  const emptyCost = notFoundField<string>();
  const costs = {
    listing_price: claimable(emptyCost, "costs.listing_price", evidence, gaps),
    property_tax: claimable(card.parcel.propertyTax, "costs.property_tax", evidence, gaps),
    hoa_or_management_fee: claimable(hoaField, "costs.hoa_or_management_fee", evidence, gaps),
    special_assessment: claimable(emptyCost, "costs.special_assessment", evidence, gaps),
    insurance_estimate: claimable(emptyCost, "costs.insurance_estimate", evidence, gaps),
  };

  pushEvidence(evidence, "estimated_price_range", card.market.priceRange);
  pushEvidence(evidence, "estimated_rent_range", card.market.rentHint);
  pushEvidence(evidence, "last_sold", card.market.lastSold);
  pushEvidence(evidence, "currency", card.market.currency);
  gapIfMissing(card.market.priceRange, "market.estimated_price_range", gaps);
  gapIfMissing(card.market.rentHint, "market.estimated_rent_range", gaps);
  gaps.push("market.recent_comparables", "market.days_on_market");

  const schoolsId = pushEvidence(evidence, "schools", card.poi.schools);
  const amenitiesId = pushEvidence(evidence, "amenities", card.poi.amenities);
  const railId = pushEvidence(evidence, "transit.rail", card.transit.rail);
  const busId = pushEvidence(evidence, "transit.bus", card.transit.bus);
  const shopId = pushEvidence(evidence, "shopping", card.poi.supermarket);
  const medicalId = pushEvidence(evidence, "medical", card.poi.hospital);
  const parkId = pushEvidence(evidence, "parks", card.poi.park);

  const amenities = foundValue(card.poi.amenities);
  const schools: ReportLocationItem[] = (foundValue(card.poi.schools) ?? []).map((name) => ({
    name,
    kind: "school",
    minutes_walk: null,
    evidence_id: schoolsId,
  }));

  const transit: ReportLocationItem[] = [];
  const rail = foundValue(card.transit.rail);
  if (rail) {
    transit.push({ name: rail, kind: "rail", minutes_walk: null, evidence_id: railId });
  }
  const bus = foundValue(card.transit.bus);
  if (bus) {
    transit.push({ name: bus, kind: "bus", minutes_walk: null, evidence_id: busId });
  }
  transit.push(...amenityItems(amenities, ["transit", "bus"], amenitiesId ?? railId));

  const shopping: ReportLocationItem[] = [];
  const supermarket = foundValue(card.poi.supermarket);
  if (supermarket) {
    shopping.push({
      name: supermarket,
      kind: "supermarket",
      minutes_walk: null,
      evidence_id: shopId,
    });
  }
  shopping.push(...amenityItems(amenities, ["supermarket"], amenitiesId ?? shopId));

  const medical: ReportLocationItem[] = [];
  const hospital = foundValue(card.poi.hospital);
  if (hospital) {
    medical.push({
      name: hospital,
      kind: "hospital",
      minutes_walk: null,
      evidence_id: medicalId,
    });
  }
  medical.push(...amenityItems(amenities, ["hospital"], amenitiesId ?? medicalId));

  const parks: ReportLocationItem[] = [];
  const park = foundValue(card.poi.park);
  if (park) {
    parks.push({ name: park, kind: "park", minutes_walk: null, evidence_id: parkId });
  }
  parks.push(...amenityItems(amenities, ["park"], amenitiesId ?? parkId));

  gaps.push(
    "location.walkability",
    "risks.flood",
    "risks.earthquake",
    "risks.wildfire",
  );

  pushEvidence(evidence, "noise", card.risk.noiseNote);
  gapIfMissing(card.risk.noiseNote, "risks.noise", gaps);

  const zoningLabel =
    foundValue(card.zoning.zoningCode) || foundValue(card.zoning.zoningLabel);
  if (zoningLabel) {
    pushEvidence(
      evidence,
      "zoning",
      card.zoning.zoningCode.status === "found"
        ? card.zoning.zoningCode
        : card.zoning.zoningLabel,
    );
  } else {
    gaps.push("risks.zoning");
  }

  const permits = foundValue(card.building.permits);
  const permitText = permits?.length ? permits.join("; ") : null;
  if (!permitText) gaps.push("risks.permit_or_violation");

  for (const snip of card.publicWebEvidence.slice(0, 10)) {
    evidence.push({
      id: `ev_${evidence.length + 1}_public_web`,
      field: "public_web_snippet",
      value: snip.value,
      unit: null,
      source_type: snip.sourceType,
      source_name: snip.sourceName ?? snip.sourceLabel,
      source_url: snip.sourceUrl ?? snip.rawRef ?? null,
      retrieved_at: snip.retrievedAt,
      effective_date: snip.effectiveDate,
      confidence: snip.confidence,
      match_level: snip.matchLevel,
      evidence: snip.evidence ?? String(snip.value),
      limitations: snip.limitations,
      status: "needs_human",
    });
  }

  return {
    request: {
      input_address: card.identity.rawAddress,
      normalized_address: normalized,
      country,
      coordinates: {
        lat: foundValue(card.identity.lat),
        lng: foundValue(card.identity.lng),
      },
      jurisdiction_key: card.meta.jurisdictionKey,
    },
    property: {
      property_type:
        foundValue(card.listing.propertyType) || foundValue(card.building.buildingType),
      year_built: foundValue(card.building.yearBuilt),
      building_area: foundValue(card.listing.area),
      lot_area: null,
      bedrooms: foundValue(card.listing.beds),
      bathrooms: foundValue(card.listing.baths),
      parking: null,
      condition: { value: null, basis: null },
    },
    costs,
    market: {
      recent_comparables: [],
      estimated_price_range: foundValue(card.market.priceRange),
      estimated_rent_range: foundValue(card.market.rentHint),
      days_on_market: null,
      currency: foundValue(card.market.currency),
      last_sold: foundValue(card.market.lastSold),
    },
    location: {
      schools,
      transit,
      shopping,
      medical,
      parks,
      walkability: null,
    },
    risks: {
      flood: null,
      earthquake: null,
      wildfire: null,
      noise: foundValue(card.risk.noiseNote),
      zoning: zoningLabel,
      permit_or_violation: permitText,
      data_gaps: [...new Set(gaps)].sort(),
    },
    evidence,
    disclaimer: PROPERTY_REPORT_DISCLAIMER,
  };
}
