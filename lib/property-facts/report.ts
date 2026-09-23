import type { AmenityFact, PropertyFactCard, ProvenancedField, SourceType } from "./types";
import { notFoundField } from "./evidence";
import { buildReportNarrative } from "./narrative";
import { buildReportCompliance } from "./compliance";
import { filterNarrativeEvidenceIds } from "./citations";
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
  if (pf.status !== "found" && pf.status !== "needs_human" && pf.status !== "conflict") {
    return null;
  }
  if (
    (pf.status === "needs_human" || pf.status === "conflict") &&
    pf.value == null &&
    !pf.evidence &&
    !pf.rawRef &&
    !(pf.conflicts && pf.conflicts.length)
  ) {
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
    status: pf.status === "conflict" ? "conflict" : pf.status,
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
  if (pf.status === "conflict") {
    gaps.push(`${field}:conflict`);
    return {
      value: null,
      basis: basisFromSourceType(pf.sourceType),
      status: "conflict",
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
  if (pf.status === "conflict") gaps.push(`${field}:conflict`);
}

function toLocationItem(
  a: AmenityFact,
  evidenceId: string | null,
): ReportLocationItem {
  return {
    name: a.name,
    kind: a.kind,
    straight_line_meters: a.straightLineMeters ?? null,
    walking_minutes: a.minutesWalk,
    driving_minutes: a.drivingMinutes ?? null,
    peak_driving_minutes: a.peakDrivingMinutes ?? null,
    evidence_id: evidenceId,
  };
}

function namedLocation(
  name: string | null,
  kind: string,
  evidenceId: string | null,
  amenities: AmenityFact[] | null,
): ReportLocationItem[] {
  if (!name) return [];
  const hit = amenities?.find((a) => a.name === name || name.startsWith(a.name));
  if (hit) return [toLocationItem({ ...hit, kind }, evidenceId)];
  return [
    {
      name,
      kind,
      straight_line_meters: null,
      walking_minutes: null,
      driving_minutes: null,
      peak_driving_minutes: null,
      evidence_id: evidenceId,
    },
  ];
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
  pushEvidence(evidence, "place_id", card.identity.placeId);
  pushEvidence(evidence, "street_number", card.identity.streetNumber);
  pushEvidence(evidence, "street_name", card.identity.streetName);

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
  const schools: ReportLocationItem[] = (foundValue(card.poi.schools) ?? []).map((name) => {
    const hit = amenities?.find((a) => a.kind === "school" && a.name === name);
    return hit
      ? toLocationItem(hit, schoolsId)
      : {
          name,
          kind: "school",
          straight_line_meters: null,
          walking_minutes: null,
          driving_minutes: null,
          peak_driving_minutes: null,
          evidence_id: schoolsId,
        };
  });

  const transit: ReportLocationItem[] = [
    ...namedLocation(foundValue(card.transit.rail), "rail", railId, amenities),
    ...namedLocation(foundValue(card.transit.bus), "bus", busId, amenities),
    ...(amenities ?? [])
      .filter((a) => a.kind === "transit" || a.kind === "bus")
      .map((a) => toLocationItem(a, amenitiesId ?? railId)),
  ];

  const shopping: ReportLocationItem[] = [
    ...namedLocation(foundValue(card.poi.supermarket), "supermarket", shopId, amenities),
    ...(amenities ?? [])
      .filter((a) => a.kind === "supermarket")
      .map((a) => toLocationItem(a, amenitiesId ?? shopId)),
  ];

  const medical: ReportLocationItem[] = [
    ...namedLocation(foundValue(card.poi.hospital), "hospital", medicalId, amenities),
    ...(amenities ?? [])
      .filter((a) => a.kind === "hospital")
      .map((a) => toLocationItem(a, amenitiesId ?? medicalId)),
  ];

  const parks: ReportLocationItem[] = [
    ...namedLocation(foundValue(card.poi.park), "park", parkId, amenities),
    ...(amenities ?? [])
      .filter((a) => a.kind === "park")
      .map((a) => toLocationItem(a, amenitiesId ?? parkId)),
  ];

  const dining: ReportLocationItem[] = (amenities ?? [])
    .filter((a) => a.kind === "restaurant" || a.kind === "dining")
    .map((a) => toLocationItem(a, amenitiesId));

  const dedupe = (items: ReportLocationItem[]) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = `${item.kind}:${item.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  gaps.push("location.walkability");

  pushEvidence(evidence, "noise", card.risk.noiseNote);
  pushEvidence(evidence, "flood", card.risk.flood);
  pushEvidence(evidence, "earthquake", card.risk.earthquake);
  pushEvidence(evidence, "wildfire", card.risk.wildfire);
  gapIfMissing(card.risk.noiseNote, "risks.noise", gaps);
  gapIfMissing(card.risk.flood, "risks.flood", gaps);
  gapIfMissing(card.risk.earthquake, "risks.earthquake", gaps);
  gapIfMissing(card.risk.wildfire, "risks.wildfire", gaps);

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

  // Distance layer gaps when amenities exist but drive times missing
  if ((amenities ?? []).some((a) => a.drivingMinutes == null)) {
    gaps.push("location.driving_minutes");
  }
  if ((amenities ?? []).some((a) => a.peakDrivingMinutes == null)) {
    gaps.push("location.peak_driving_minutes");
  }

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

  const match = card.meta.match;
  if (match) {
    for (const note of match.notes) {
      if (note.includes("not_found") && !gaps.includes(`match.${note}`)) {
        gaps.push(`match.${note}`);
      }
    }
  }

  // Structural gaps from national adapter
  const adapterSnap = card.meta.countryAdapter;
  if (adapterSnap) {
    for (const g of adapterSnap.structural_gaps) {
      gaps.push(g);
    }
  }

  const reportBody: Omit<PropertyReport, "narrative" | "compliance"> = {
    request: {
      input_address: card.identity.rawAddress,
      normalized_address: normalized,
      country,
      coordinates: {
        lat: foundValue(card.identity.lat),
        lng: foundValue(card.identity.lng),
      },
      place_id: foundValue(card.identity.placeId),
      address_components: {
        street_number: foundValue(card.identity.streetNumber),
        street_name: foundValue(card.identity.streetName),
        city: foundValue(card.identity.city),
        admin1: foundValue(card.identity.admin1),
        county: foundValue(card.identity.county),
        district: foundValue(card.identity.district),
        section: foundValue(card.identity.section),
        doorplate: foundValue(card.identity.doorplate),
        postal_code: foundValue(card.identity.postalCode),
        country: foundValue(card.identity.countryCode),
      },
      jurisdiction_key: card.meta.jurisdictionKey,
      match: match
        ? {
            level: match.level,
            place_id: match.placeId,
            parcel_id: match.parcelId,
            building_id: match.buildingId,
            unit_id: match.unitId,
            listing_id: match.listingId,
            notes: match.notes,
          }
        : null,
      adapter: adapterSnap
        ? {
            id: adapterSnap.id,
            units: {
              area: adapterSnap.units.area,
              currency: adapterSnap.units.currency,
            },
            available_data_types: adapterSnap.available_data_types,
            providers_preferred: adapterSnap.providers_preferred,
            providers_disabled: adapterSnap.providers_disabled,
            structural_gaps: adapterSnap.structural_gaps,
            legal_notices: adapterSnap.legal_notices,
            fee_label: adapterSnap.fee_label,
            fee_label_zh: adapterSnap.fee_label_zh,
            localized_labels: adapterSnap.localized_labels,
          }
        : null,
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
      schools: dedupe(schools),
      transit: dedupe(transit),
      shopping: dedupe(shopping),
      medical: dedupe(medical),
      parks: dedupe(parks),
      dining: dedupe(dining),
      walkability: null,
    },
    risks: {
      flood: foundValue(card.risk.flood),
      earthquake: foundValue(card.risk.earthquake),
      wildfire: foundValue(card.risk.wildfire),
      noise: foundValue(card.risk.noiseNote),
      zoning: zoningLabel,
      permit_or_violation: permitText,
      data_gaps: [...new Set(gaps)].sort(),
    },
    evidence,
    disclaimer: PROPERTY_REPORT_DISCLAIMER,
  };

  const compliance = buildReportCompliance(card);
  const withCompliance = { ...reportBody, compliance };
  const narrative = buildReportNarrative(withCompliance);
  const allowedIds = reportBody.evidence.map((e) => e.id);
  narrative.sections_zh = filterNarrativeEvidenceIds(narrative.sections_zh, allowedIds);
  const summaryCheck = filterNarrativeEvidenceIds(
    [{ evidence_ids: [], body: narrative.summary_zh }],
    allowedIds,
  )[0];
  narrative.summary_zh = summaryCheck.body;
  narrative.source_snippets = narrative.source_snippets.filter((s) =>
    allowedIds.includes(s.evidence_id),
  );

  return {
    ...withCompliance,
    narrative,
  };
}
