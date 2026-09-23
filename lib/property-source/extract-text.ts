/**
 * Heuristic extract → PropertyData patches from free text (no invented facts).
 */

import {
  createEmptyPropertyData,
  sourcedField,
  type PropertyData,
} from "./types";
import {
  detectMarketFromAddress,
  mapExtractedLabelToMarketField,
  marketSpecificTemplate,
} from "./market-fields";
import {
  detectAreaUnitFromText,
  detectCurrencyFromText,
  parseLooseNumber,
} from "./units";
import { mergeSourcedFieldPreferHigherConfidence } from "./completeness";

export type ExtractPatch = {
  data: PropertyData;
  candidates: Array<{ path: string; value: unknown; sourceId: string }>;
};

export function extractFactsFromText(
  text: string,
  opts: {
    sourceId: string;
    inputAddress?: string;
    countryHint?: string | null;
  },
): ExtractPatch {
  const data = createEmptyPropertyData(opts.inputAddress ?? "");
  const market = detectMarketFromAddress(
    opts.inputAddress || opts.countryHint || text.slice(0, 200),
  );
  data.marketSpecific = marketSpecificTemplate(market);
  data.location.country = sourcedField(
    market === "OTHER" ? (opts.countryHint ?? "") : market,
    {
      sourceIds: [opts.sourceId],
      confidence: market === "OTHER" ? 0.3 : 0.6,
      verificationStatus: "inferred",
      notes: "Inferred from address/text heuristics",
    },
  );
  if (opts.inputAddress) {
    data.location.normalizedAddress = sourcedField(opts.inputAddress, {
      sourceIds: [opts.sourceId],
      confidence: 0.5,
      verificationStatus: "unverified",
      notes: "User-provided address (not rewritten)",
    });
  }

  const candidates: ExtractPatch["candidates"] = [];
  const push = (path: string, value: unknown) => {
    candidates.push({ path, value, sourceId: opts.sourceId });
  };

  const priceMatch =
    text.match(
      /(?:售價|開價|listing\s*price|asking|price)\s*[:：]?\s*([^\n,，]{2,40})/i,
    ) || text.match(/(?:NT\$|CAD|USD|US\$|C\$|\$)\s*([\d,，.]+)\s*(萬)?/);
  if (priceMatch) {
    const raw = priceMatch[0];
    data.listing.price = sourcedField(raw.trim(), {
      sourceIds: [opts.sourceId],
      confidence: 0.45,
      verificationStatus: "unverified",
    });
    push("listing.price", raw.trim());
    const cur = detectCurrencyFromText(raw) ?? detectCurrencyFromText(text);
    if (cur) {
      data.listing.currency = sourcedField(cur, {
        sourceIds: [opts.sourceId],
        confidence: 0.5,
        verificationStatus: "inferred",
      });
      push("listing.currency", cur);
    }
  }

  const bed = text.match(/(\d+)\s*(?:房|bed(?:room)?s?|br)\b/i);
  if (bed) {
    const n = Number(bed[1]);
    data.listing.bedrooms = sourcedField(n, {
      sourceIds: [opts.sourceId],
      confidence: 0.5,
      verificationStatus: "unverified",
      normalizedValue: String(n),
    });
    push("listing.bedrooms", n);
  }

  const bath = text.match(/(\d+(?:\.\d+)?)\s*(?:衛|浴|bath(?:room)?s?|ba)\b/i);
  if (bath) {
    const n = Number(bath[1]);
    data.listing.bathrooms = sourcedField(n, {
      sourceIds: [opts.sourceId],
      confidence: 0.5,
      verificationStatus: "unverified",
      normalizedValue: String(n),
    });
    push("listing.bathrooms", n);
  }

  const areaUnit = detectAreaUnitFromText(text);
  const areaMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:坪|ping|sq\.?\s*ft|sqft|m²|平方米|平方公尺)/i,
  );
  if (areaMatch) {
    const n = parseLooseNumber(areaMatch[1] ?? areaMatch[0]);
    if (n != null) {
      data.listing.area = sourcedField(n, {
        sourceIds: [opts.sourceId],
        confidence: 0.45,
        verificationStatus: "unverified",
        normalizedValue: String(n),
      });
      push("listing.area", n);
      if (areaUnit) {
        data.listing.areaUnit = sourcedField(areaUnit, {
          sourceIds: [opts.sourceId],
          confidence: 0.5,
          verificationStatus: "inferred",
        });
      }
    }
  }

  const year = text.match(
    /(?:屋齡|year\s*built|built)\s*[:：]?\s*(\d{4}|\d+)\s*(?:年)?/i,
  );
  if (year) {
    let y = Number(year[1]);
    if (y < 100) y = new Date().getFullYear() - y; // 屋齡 N 年
    if (y > 1800 && y <= new Date().getFullYear() + 1) {
      data.identity.yearBuilt = sourcedField(y, {
        sourceIds: [opts.sourceId],
        confidence: 0.4,
        verificationStatus: "unverified",
        normalizedValue: String(y),
      });
      push("identity.yearBuilt", y);
    }
  }

  const typeMatch = text.match(
    /(?:物件類型|property\s*type|類型)\s*[:：]?\s*([^\n,，]{2,30})/i,
  ) || text.match(/(預售屋|新成屋|中古屋|法拍屋|condo|townhouse|single[\s-]family|公寓|透天)/i);
  if (typeMatch) {
    const v = typeMatch[1] || typeMatch[0];
    data.identity.propertyType = sourcedField(v.trim(), {
      sourceIds: [opts.sourceId],
      confidence: 0.45,
      verificationStatus: "unverified",
    });
    push("identity.propertyType", v.trim());
    const msKey = mapExtractedLabelToMarketField(market, v);
    if (msKey && data.marketSpecific) data.marketSpecific[msKey] = v.trim();
  }

  const fee = text.match(
    /(?:管理費|HOA|condo\s*fee|strata\s*fee)\s*[:：]?\s*([^\n,，]{2,40})/i,
  );
  if (fee) {
    data.costs.hoaOrManagementFee = sourcedField(fee[0].trim(), {
      sourceIds: [opts.sourceId],
      confidence: 0.4,
      verificationStatus: "unverified",
    });
    push("costs.hoaOrManagementFee", fee[0].trim());
  }

  data.listing.description = sourcedField(text.slice(0, 500), {
    sourceIds: [opts.sourceId],
    confidence: 0.3,
    verificationStatus: "unverified",
    notes: "Truncated source excerpt",
  });

  return { data, candidates };
}

export function mergePropertyData(
  base: PropertyData,
  patch: PropertyData,
): PropertyData {
  return {
    ...base,
    identity: {
      listingId: mergeSourcedFieldPreferHigherConfidence(
        base.identity.listingId,
        patch.identity.listingId,
      ),
      propertyType: mergeSourcedFieldPreferHigherConfidence(
        base.identity.propertyType,
        patch.identity.propertyType,
      ),
      yearBuilt: mergeSourcedFieldPreferHigherConfidence(
        base.identity.yearBuilt,
        patch.identity.yearBuilt,
      ),
      floors: mergeSourcedFieldPreferHigherConfidence(
        base.identity.floors,
        patch.identity.floors,
      ),
      unit: mergeSourcedFieldPreferHigherConfidence(
        base.identity.unit,
        patch.identity.unit,
      ),
    },
    location: {
      inputAddress: base.location.inputAddress || patch.location.inputAddress,
      normalizedAddress: mergeSourcedFieldPreferHigherConfidence(
        base.location.normalizedAddress,
        patch.location.normalizedAddress,
      ),
      country: mergeSourcedFieldPreferHigherConfidence(
        base.location.country,
        patch.location.country,
      ),
      admin1: mergeSourcedFieldPreferHigherConfidence(
        base.location.admin1,
        patch.location.admin1,
      ),
      city: mergeSourcedFieldPreferHigherConfidence(
        base.location.city,
        patch.location.city,
      ),
      district: mergeSourcedFieldPreferHigherConfidence(
        base.location.district,
        patch.location.district,
      ),
      postalCode: mergeSourcedFieldPreferHigherConfidence(
        base.location.postalCode,
        patch.location.postalCode,
      ),
      lat: mergeSourcedFieldPreferHigherConfidence(
        base.location.lat,
        patch.location.lat,
      ),
      lng: mergeSourcedFieldPreferHigherConfidence(
        base.location.lng,
        patch.location.lng,
      ),
    },
    listing: {
      price: mergeSourcedFieldPreferHigherConfidence(
        base.listing.price,
        patch.listing.price,
      ),
      currency: mergeSourcedFieldPreferHigherConfidence(
        base.listing.currency,
        patch.listing.currency,
      ),
      status: mergeSourcedFieldPreferHigherConfidence(
        base.listing.status,
        patch.listing.status,
      ),
      bedrooms: mergeSourcedFieldPreferHigherConfidence(
        base.listing.bedrooms,
        patch.listing.bedrooms,
      ),
      bathrooms: mergeSourcedFieldPreferHigherConfidence(
        base.listing.bathrooms,
        patch.listing.bathrooms,
      ),
      area: mergeSourcedFieldPreferHigherConfidence(
        base.listing.area,
        patch.listing.area,
      ),
      areaUnit: mergeSourcedFieldPreferHigherConfidence(
        base.listing.areaUnit,
        patch.listing.areaUnit,
      ),
      description: mergeSourcedFieldPreferHigherConfidence(
        base.listing.description,
        patch.listing.description,
      ),
    },
    condition: {
      knownCondition: mergeSourcedFieldPreferHigherConfidence(
        base.condition.knownCondition,
        patch.condition.knownCondition,
      ),
      photoObservations: [
        ...base.condition.photoObservations,
        ...patch.condition.photoObservations,
      ],
      needsInspection: [
        ...base.condition.needsInspection,
        ...patch.condition.needsInspection,
      ],
      unverifiableFromPhotos: [
        ...base.condition.unverifiableFromPhotos,
        ...patch.condition.unverifiableFromPhotos,
      ],
      conditionConfidence: Math.max(
        base.condition.conditionConfidence,
        patch.condition.conditionConfidence,
      ),
    },
    costs: {
      listPrice: mergeSourcedFieldPreferHigherConfidence(
        base.costs.listPrice,
        patch.costs.listPrice,
      ),
      hoaOrManagementFee: mergeSourcedFieldPreferHigherConfidence(
        base.costs.hoaOrManagementFee,
        patch.costs.hoaOrManagementFee,
      ),
      propertyTax: mergeSourcedFieldPreferHigherConfidence(
        base.costs.propertyTax,
        patch.costs.propertyTax,
      ),
      insuranceEstimate: mergeSourcedFieldPreferHigherConfidence(
        base.costs.insuranceEstimate,
        patch.costs.insuranceEstimate,
      ),
      parkingFee: mergeSourcedFieldPreferHigherConfidence(
        base.costs.parkingFee,
        patch.costs.parkingFee,
      ),
      holdingCostEstimate: mergeSourcedFieldPreferHigherConfidence(
        base.costs.holdingCostEstimate,
        patch.costs.holdingCostEstimate,
      ),
    },
    amenities: {
      parking: mergeSourcedFieldPreferHigherConfidence(
        base.amenities.parking,
        patch.amenities.parking,
      ),
      elevator: mergeSourcedFieldPreferHigherConfidence(
        base.amenities.elevator,
        patch.amenities.elevator,
      ),
      appliances: mergeSourcedFieldPreferHigherConfidence(
        base.amenities.appliances,
        patch.amenities.appliances,
      ),
      other: [...base.amenities.other, ...patch.amenities.other],
    },
    neighborhood: {
      grocery: mergeSourcedFieldPreferHigherConfidence(
        base.neighborhood.grocery,
        patch.neighborhood.grocery,
      ),
      medical: mergeSourcedFieldPreferHigherConfidence(
        base.neighborhood.medical,
        patch.neighborhood.medical,
      ),
      schools: mergeSourcedFieldPreferHigherConfidence(
        base.neighborhood.schools,
        patch.neighborhood.schools,
      ),
      dining: mergeSourcedFieldPreferHigherConfidence(
        base.neighborhood.dining,
        patch.neighborhood.dining,
      ),
      parks: mergeSourcedFieldPreferHigherConfidence(
        base.neighborhood.parks,
        patch.neighborhood.parks,
      ),
      commercial: mergeSourcedFieldPreferHigherConfidence(
        base.neighborhood.commercial,
        patch.neighborhood.commercial,
      ),
      custom: [...base.neighborhood.custom, ...patch.neighborhood.custom],
    },
    transportation: {
      walkConvenience: mergeSourcedFieldPreferHigherConfidence(
        base.transportation.walkConvenience,
        patch.transportation.walkConvenience,
      ),
      driveConvenience: mergeSourcedFieldPreferHigherConfidence(
        base.transportation.driveConvenience,
        patch.transportation.driveConvenience,
      ),
      transitConvenience: mergeSourcedFieldPreferHigherConfidence(
        base.transportation.transitConvenience,
        patch.transportation.transitConvenience,
      ),
      nearestTransit: mergeSourcedFieldPreferHigherConfidence(
        base.transportation.nearestTransit,
        patch.transportation.nearestTransit,
      ),
      commuteNotes: mergeSourcedFieldPreferHigherConfidence(
        base.transportation.commuteNotes,
        patch.transportation.commuteNotes,
      ),
    },
    risks: [...base.risks, ...patch.risks],
    marketSpecific: {
      ...(base.marketSpecific ?? {}),
      ...(patch.marketSpecific ?? {}),
    },
  };
}
