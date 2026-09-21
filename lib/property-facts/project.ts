import {
  emptyPropertyBasics,
  type PropertyBasicsField,
  type PropertyBasicsSnapshot,
} from "@/lib/property-basics/types";
import {
  emptyIntel,
  looksLikeUnitLevelAddress,
  type PropertyIntel,
} from "@/lib/property-intel/types";
import type { PropertyFactCard, ProvenancedField } from "./types";

function foundValue<T>(field: ProvenancedField<T>): T | null {
  return field.status === "found" ? field.value : null;
}

function sourcesFromCard(card: PropertyFactCard): string[] {
  const labels = new Set<string>();
  const walk = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    if ("sourceLabel" in obj && typeof (obj as ProvenancedField<unknown>).sourceLabel === "string") {
      const f = obj as ProvenancedField<unknown>;
      if (f.status === "found" && f.sourceLabel) labels.add(f.sourceLabel);
      return;
    }
    for (const v of Object.values(obj as Record<string, unknown>)) walk(v);
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
  if (card.publicWebEvidence.length) labels.add("Bing Search (evidence only)");
  return [...labels];
}

/**
 * Project FactCard → legacy PropertyIntel for UI compatibility.
 * Only found values are copied; never invents from publicWebEvidence.
 */
export function projectFactCardToIntel(card: PropertyFactCard): PropertyIntel {
  const address =
    foundValue(card.identity.displayAddress) ||
    foundValue(card.identity.normalizedAddress) ||
    card.identity.rawAddress;
  const normalizedQuery =
    foundValue(card.identity.normalizedAddress) || card.identity.rawAddress;
  const intel = emptyIntel(address, normalizedQuery);

  intel.basic.year = foundValue(card.building.yearBuilt);
  intel.basic.type =
    foundValue(card.listing.propertyType) || foundValue(card.building.buildingType);
  intel.basic.beds = foundValue(card.listing.beds);
  intel.basic.baths = foundValue(card.listing.baths);
  intel.basic.area = foundValue(card.listing.area);
  intel.basic.pid = foundValue(card.parcel.pid);

  intel.history.last_sold = foundValue(card.market.lastSold);
  intel.history.assessed = foundValue(card.parcel.assessedValue);
  intel.history.strata = foundValue(card.hoa.strataFee);

  intel.location.lat = foundValue(card.identity.lat);
  intel.location.lng = foundValue(card.identity.lng);
  intel.location.skytrain = foundValue(card.transit.rail);
  intel.location.bus = foundValue(card.transit.bus);
  intel.location.schools = foundValue(card.poi.schools) ?? [];
  intel.location.supermarket = foundValue(card.poi.supermarket);
  intel.location.park = foundValue(card.poi.park);
  intel.location.hospital = foundValue(card.poi.hospital);
  intel.location.noise = foundValue(card.risk.noiseNote);
  intel.location.amenities = (foundValue(card.poi.amenities) ?? []).map((a) => ({
    kind: a.kind,
    name: a.name,
    minutesWalk: a.minutesWalk,
    source: "property_facts",
  }));

  intel.market.region = card.region;
  intel.market.currency = foundValue(card.market.currency);
  intel.market.avgUnitPrice = foundValue(card.market.avgUnitPrice);
  intel.market.priceRange = foundValue(card.market.priceRange);

  const riskItems = foundValue(card.risk.items);
  intel.risks = riskItems?.map((r) => r.label) ?? [];

  intel.compliance = {
    streetViewNotice: false,
    unitLevelNotice:
      looksLikeUnitLevelAddress(card.identity.rawAddress) ||
      Boolean(foundValue(card.identity.unitHint)),
  };

  intel.sources = sourcesFromCard(card);
  intel.fetchedAt = card.meta.assembledAt;

  // Surface needs_human listing notes without treating as facts
  const notes = card.listing.notes;
  if (notes.status === "needs_human" && notes.rawRef) {
    intel.neighborhood.notes.push(`待人工確認：公開網頁提及（${notes.rawRef.slice(0, 80)}）`);
  }

  return intel;
}

function basicsFieldFromProvenanced(
  field: ProvenancedField<string | number>,
  asString = true,
): PropertyBasicsField {
  if (field.status === "found" && field.value != null) {
    return {
      value: asString ? String(field.value) : String(field.value),
      confidence: typeof field.confidence === "number" && field.confidence >= 0.8 ? "verified" : "inferred",
      note: field.sourceLabel ?? undefined,
    };
  }
  if (field.status === "needs_human") {
    return {
      value: null,
      confidence: "unknown",
      note: "needs_human",
    };
  }
  return {
    value: null,
    confidence: "unknown",
    note: "not_found",
  };
}

/** Project FactCard → PropertyBasicsSnapshot (no LLM invention). */
export function projectFactCardToBasics(card: PropertyFactCard): PropertyBasicsSnapshot {
  const address =
    foundValue(card.identity.displayAddress) ||
    foundValue(card.identity.normalizedAddress) ||
    card.identity.rawAddress;
  const base = emptyPropertyBasics(address);

  const type =
    foundValue(card.listing.propertyType) || foundValue(card.building.buildingType);
  const year = foundValue(card.building.yearBuilt);
  const beds = foundValue(card.listing.beds);
  const baths = foundValue(card.listing.baths);
  const area = foundValue(card.listing.area);

  return {
    ...base,
    displayName: {
      value: address || null,
      confidence: address ? "verified" : "unknown",
    },
    propertyType: type
      ? { value: type, confidence: "verified", note: card.listing.propertyType.sourceLabel ?? undefined }
      : basicsFieldFromProvenanced(card.listing.propertyType),
    layout:
      beds != null || baths != null
        ? {
            value: [beds != null ? `${beds}床` : null, baths != null ? `${baths}衛` : null]
              .filter(Boolean)
              .join(" "),
            confidence: "verified",
          }
        : { value: null, confidence: "unknown", note: "not_found" },
    area: area != null
      ? { value: String(area), confidence: "verified" }
      : { value: null, confidence: "unknown", note: "not_found" },
    // Listing economics stay unknown unless a licensed/official lane fills them later
    price: { value: null, confidence: "unknown", note: "not_found" },
    managementFee: basicsFieldFromProvenanced(
      card.hoa.managementFee.status === "found"
        ? card.hoa.managementFee
        : card.hoa.strataFee,
    ),
    yearBuilt: year != null
      ? { value: String(year), confidence: "verified" }
      : { value: null, confidence: "unknown", note: "not_found" },
    summary: {
      value: null,
      confidence: "unknown",
      note: "not_found",
    },
    sources: sourcesFromCard(card),
    generatedAt: card.meta.assembledAt,
  };
}

/** Compact JSON for LLM report prompts — found fields only + explicit gaps. */
export function factCardPromptPayload(card: PropertyFactCard): Record<string, unknown> {
  const pick = <T>(field: ProvenancedField<T>, name: string) => {
    if (field.status === "found") {
      return {
        [name]: {
          value: field.value,
          unit: field.unit,
          sourceType: field.sourceType,
          source: field.sourceLabel,
          confidence: field.confidence,
          matchLevel: field.matchLevel,
          retrievedAt: field.retrievedAt,
          effectiveDate: field.effectiveDate,
          limitations: field.limitations,
        },
      };
    }
    if (field.status === "needs_human") {
      return {
        [name]: {
          status: "needs_human",
          claim: field.value,
          confidence: field.confidence,
          limitations: field.limitations ?? "未確認，不可當成事實",
        },
      };
    }
    return { [name]: { status: field.status } };
  };

  return {
    region: card.region,
    geocodeOk: card.meta.geocodeOk,
    coverage: card.meta.coverageSummary,
    identity: {
      ...pick(card.identity.displayAddress, "displayAddress"),
      ...pick(card.identity.countryCode, "countryCode"),
      ...pick(card.identity.city, "city"),
      ...pick(card.identity.postalCode, "postalCode"),
      ...pick(card.identity.lat, "lat"),
      ...pick(card.identity.lng, "lng"),
    },
    building: {
      ...pick(card.building.yearBuilt, "yearBuilt"),
      ...pick(card.building.buildingType, "buildingType"),
    },
    listing: {
      ...pick(card.listing.propertyType, "propertyType"),
      ...pick(card.listing.beds, "beds"),
      ...pick(card.listing.baths, "baths"),
      ...pick(card.listing.area, "area"),
    },
    parcel: {
      ...pick(card.parcel.pid, "pid"),
      ...pick(card.parcel.assessedValue, "assessedValue"),
      ...pick(card.parcel.propertyTax, "propertyTax"),
    },
    zoning: {
      ...pick(card.zoning.zoningCode, "zoningCode"),
      ...pick(card.zoning.zoningLabel, "zoningLabel"),
    },
    hoa: {
      ...pick(card.hoa.managementFee, "managementFee"),
      ...pick(card.hoa.strataFee, "strataFee"),
    },
    transit: {
      ...pick(card.transit.rail, "rail"),
      ...pick(card.transit.bus, "bus"),
    },
    poi: {
      ...pick(card.poi.schools, "schools"),
      ...pick(card.poi.supermarket, "supermarket"),
    },
    market: {
      ...pick(card.market.currency, "currency"),
      ...pick(card.market.lastSold, "lastSold"),
      ...pick(card.market.priceRange, "priceRange"),
    },
    instruction:
      "Only cite objects that have value. needs_human.claim is an unverified listing or indirect claim — say it is unconfirmed. Never invent missing fields.",
  };
}
