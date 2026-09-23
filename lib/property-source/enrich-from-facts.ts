/**
 * Map PropertyFactCard → PropertyData patch for viewing-chat enrich.
 * All mapped values stay unverified / inferred — never promoted to verified.
 */

import type {
  AmenityFact,
  PropertyFactCard,
  ProvenancedField,
  RiskFact,
} from "@/lib/property-facts/types";
import {
  createEmptyPropertyData,
  sourcedField,
  type PropertyData,
  type RiskItem,
} from "./types";
import { buildProviderAvailabilityNotes } from "./provider-availability-notes";

export type EnrichFromFactsResult = {
  notes: string[];
  patch: PropertyData;
  availability: ReturnType<typeof buildProviderAvailabilityNotes>["availability"];
};

function hasUsableValue<T>(field: ProvenancedField<T> | undefined | null): boolean {
  return Boolean(
    field &&
      (field.status === "found" || field.status === "needs_human") &&
      field.value != null &&
      !(Array.isArray(field.value) && field.value.length === 0),
  );
}

function sourceIdFor(field: ProvenancedField<unknown>, fallback: string): string {
  return field.sourceId ? `enrich:${field.sourceId}` : fallback;
}

function confidenceOf(field: ProvenancedField<unknown>): number {
  if (typeof field.confidence === "number") {
    return Math.max(0.15, Math.min(0.65, field.confidence));
  }
  return field.status === "needs_human" ? 0.3 : 0.35;
}

function verificationFor(
  _field: ProvenancedField<unknown>,
): "unverified" {
  return "unverified";
}

function formatAmenityList(amenities: AmenityFact[] | null | undefined): string | null {
  if (!amenities?.length) return null;
  return amenities
    .slice(0, 6)
    .map((a) => {
      const walk =
        a.minutesWalk != null ? `約步行 ${a.minutesWalk} 分` : null;
      const drive =
        a.drivingMinutes != null ? `車程約 ${a.drivingMinutes} 分` : null;
      const dist =
        !walk && !drive && a.straightLineMeters != null
          ? `直線約 ${Math.round(a.straightLineMeters)} m（非通勤時間）`
          : null;
      const detail = [walk, drive, dist].filter(Boolean).join("／");
      return detail ? `${a.name}（${detail}）` : a.name;
    })
    .join("；");
}

function mapRisks(card: PropertyFactCard): RiskItem[] {
  const out: RiskItem[] = [];
  const items = card.risk.items;
  if (hasUsableValue(items) && Array.isArray(items.value)) {
    for (const r of items.value as RiskFact[]) {
      out.push({
        id: `enrich_risk_${r.code}`,
        priority: "medium",
        description: r.label || r.code,
        rationale: "來自外部風險資料摘要，需人工／官方來源確認",
        sourceIds: [sourceIdFor(items, "enrich:risk")],
        confidence: confidenceOf(items),
        howToVerify: "查閱官方災害／風險地圖或向仲介確認",
        askWhom: "仲介／地方政府公開資料",
      });
    }
  }
  for (const [code, field] of [
    ["flood", card.risk.flood],
    ["earthquake", card.risk.earthquake],
    ["wildfire", card.risk.wildfire],
    ["noise", card.risk.noiseNote],
  ] as const) {
    if (!hasUsableValue(field)) continue;
    out.push({
      id: `enrich_risk_${code}`,
      priority: code === "flood" || code === "earthquake" ? "high" : "medium",
      description: String(field.value),
      rationale: field.limitations || "外部資料提示，尚未現場／官方驗證",
      sourceIds: [sourceIdFor(field, `enrich:risk:${code}`)],
      confidence: confidenceOf(field),
      howToVerify: "對照官方風險圖層與保險／仲介說明",
      askWhom: "仲介／保險／地方政府",
    });
  }
  return out;
}

export function enrichPropertyDataFromFactCard(
  card: PropertyFactCard,
): EnrichFromFactsResult {
  const patch = createEmptyPropertyData(card.identity.rawAddress);
  const sid = (field: ProvenancedField<unknown>, fb: string) =>
    sourceIdFor(field, fb);

  const { notes, availability } = buildProviderAvailabilityNotes({
    used: card.meta.providersUsed,
    skipped: card.meta.providersSkipped,
    region: card.region,
  });

  // Location
  if (hasUsableValue(card.identity.normalizedAddress)) {
    patch.location.normalizedAddress = sourcedField(
      String(card.identity.normalizedAddress.value),
      {
        sourceIds: [sid(card.identity.normalizedAddress, "enrich:geocode")],
        confidence: confidenceOf(card.identity.normalizedAddress),
        verificationStatus: verificationFor(card.identity.normalizedAddress),
        notes: "Geocoded address — verify against listing",
      },
    );
  }
  if (hasUsableValue(card.identity.lat)) {
    patch.location.lat = sourcedField(Number(card.identity.lat.value), {
      sourceIds: [sid(card.identity.lat, "enrich:geocode")],
      confidence: confidenceOf(card.identity.lat),
      verificationStatus: verificationFor(card.identity.lat),
      normalizedValue: String(card.identity.lat.value),
    });
  }
  if (hasUsableValue(card.identity.lng)) {
    patch.location.lng = sourcedField(Number(card.identity.lng.value), {
      sourceIds: [sid(card.identity.lng, "enrich:geocode")],
      confidence: confidenceOf(card.identity.lng),
      verificationStatus: verificationFor(card.identity.lng),
      normalizedValue: String(card.identity.lng.value),
    });
  }
  if (hasUsableValue(card.identity.countryCode)) {
    patch.location.country = sourcedField(String(card.identity.countryCode.value), {
      sourceIds: [sid(card.identity.countryCode, "enrich:geocode")],
      confidence: confidenceOf(card.identity.countryCode),
      verificationStatus: "inferred",
    });
  }
  if (hasUsableValue(card.identity.admin1)) {
    patch.location.admin1 = sourcedField(String(card.identity.admin1.value), {
      sourceIds: [sid(card.identity.admin1, "enrich:geocode")],
      confidence: confidenceOf(card.identity.admin1),
      verificationStatus: verificationFor(card.identity.admin1),
    });
  }
  if (hasUsableValue(card.identity.city)) {
    patch.location.city = sourcedField(String(card.identity.city.value), {
      sourceIds: [sid(card.identity.city, "enrich:geocode")],
      confidence: confidenceOf(card.identity.city),
      verificationStatus: verificationFor(card.identity.city),
    });
  }

  // Listing basics from facts (only fill; user sources usually win via merge confidence)
  if (hasUsableValue(card.listing.propertyType)) {
    patch.identity.propertyType = sourcedField(
      String(card.listing.propertyType.value),
      {
        sourceIds: [sid(card.listing.propertyType, "enrich:listing")],
        confidence: confidenceOf(card.listing.propertyType),
        verificationStatus: verificationFor(card.listing.propertyType),
      },
    );
  }
  if (hasUsableValue(card.listing.beds)) {
    patch.listing.bedrooms = sourcedField(Number(card.listing.beds.value), {
      sourceIds: [sid(card.listing.beds, "enrich:listing")],
      confidence: confidenceOf(card.listing.beds),
      verificationStatus: verificationFor(card.listing.beds),
      normalizedValue: String(card.listing.beds.value),
    });
  }
  if (hasUsableValue(card.listing.baths)) {
    patch.listing.bathrooms = sourcedField(Number(card.listing.baths.value), {
      sourceIds: [sid(card.listing.baths, "enrich:listing")],
      confidence: confidenceOf(card.listing.baths),
      verificationStatus: verificationFor(card.listing.baths),
      normalizedValue: String(card.listing.baths.value),
    });
  }
  if (hasUsableValue(card.building.yearBuilt)) {
    patch.identity.yearBuilt = sourcedField(Number(card.building.yearBuilt.value), {
      sourceIds: [sid(card.building.yearBuilt, "enrich:building")],
      confidence: confidenceOf(card.building.yearBuilt),
      verificationStatus: verificationFor(card.building.yearBuilt),
      normalizedValue: String(card.building.yearBuilt.value),
    });
  }

  // Costs — listing_claim HOA often lands as needs_human; still surface as unverified
  const hoaField =
    hasUsableValue(card.hoa.managementFee)
      ? card.hoa.managementFee
      : hasUsableValue(card.hoa.strataFee)
        ? card.hoa.strataFee
        : null;
  if (hoaField) {
    patch.costs.hoaOrManagementFee = sourcedField(String(hoaField.value), {
      sourceIds: [sid(hoaField, "enrich:hoa")],
      confidence: confidenceOf(hoaField),
      verificationStatus: "unverified",
      notes: "External/listing claim — verify with HOA / management docs",
    });
  }
  if (hasUsableValue(card.parcel.propertyTax)) {
    patch.costs.propertyTax = sourcedField(String(card.parcel.propertyTax.value), {
      sourceIds: [sid(card.parcel.propertyTax, "enrich:tax")],
      confidence: confidenceOf(card.parcel.propertyTax),
      verificationStatus: "unverified",
      notes: "Tax figure from external record — confirm with authority",
    });
  }

  // Neighborhood / POI
  if (hasUsableValue(card.poi.supermarket)) {
    patch.neighborhood.grocery = sourcedField(String(card.poi.supermarket.value), {
      sourceIds: [sid(card.poi.supermarket, "enrich:poi")],
      confidence: confidenceOf(card.poi.supermarket),
      verificationStatus: verificationFor(card.poi.supermarket),
    });
  }
  if (hasUsableValue(card.poi.hospital)) {
    patch.neighborhood.medical = sourcedField(String(card.poi.hospital.value), {
      sourceIds: [sid(card.poi.hospital, "enrich:poi")],
      confidence: confidenceOf(card.poi.hospital),
      verificationStatus: verificationFor(card.poi.hospital),
    });
  }
  if (hasUsableValue(card.poi.schools)) {
    const schools = (card.poi.schools.value as string[]).slice(0, 5).join("；");
    patch.neighborhood.schools = sourcedField(schools, {
      sourceIds: [sid(card.poi.schools, "enrich:poi")],
      confidence: confidenceOf(card.poi.schools),
      verificationStatus: verificationFor(card.poi.schools),
      notes: "School proximity is not a quality rating",
    });
  }
  if (hasUsableValue(card.poi.park)) {
    patch.neighborhood.parks = sourcedField(String(card.poi.park.value), {
      sourceIds: [sid(card.poi.park, "enrich:poi")],
      confidence: confidenceOf(card.poi.park),
      verificationStatus: verificationFor(card.poi.park),
    });
  }
  if (hasUsableValue(card.poi.amenities)) {
    const line = formatAmenityList(card.poi.amenities.value as AmenityFact[]);
    if (line) {
      patch.neighborhood.commercial = sourcedField(line, {
        sourceIds: [sid(card.poi.amenities, "enrich:poi")],
        confidence: confidenceOf(card.poi.amenities),
        verificationStatus: verificationFor(card.poi.amenities),
      });
    }
  }

  // Transit
  const transitBits: string[] = [];
  let hasDrivingMinutes = false;
  if (hasUsableValue(card.transit.rail)) {
    transitBits.push(`軌道：${card.transit.rail.value}`);
  }
  if (hasUsableValue(card.transit.bus)) {
    transitBits.push(`公車：${card.transit.bus.value}`);
  }
  if (hasUsableValue(card.poi.amenities)) {
    const amenities = card.poi.amenities.value as AmenityFact[];
    hasDrivingMinutes = amenities.some(
      (a) => a.drivingMinutes != null || a.peakDrivingMinutes != null,
    );
  }
  if (transitBits.length) {
    patch.transportation.nearestTransit = sourcedField(transitBits.join("；"), {
      sourceIds: [
        hasUsableValue(card.transit.rail)
          ? sid(card.transit.rail, "enrich:transit")
          : sid(card.transit.bus, "enrich:transit"),
      ],
      confidence: 0.4,
      verificationStatus: "unverified",
    });
  }
  if (hasDrivingMinutes) {
    patch.transportation.commuteNotes = sourcedField(
      "部分地點含車程分鐘（Distance Matrix）；仍需依實際出發點與時段驗證。",
      {
        sourceIds: ["enrich:transit"],
        confidence: 0.4,
        verificationStatus: "unverified",
      },
    );
  } else if (transitBits.length || hasUsableValue(card.poi.amenities)) {
    patch.transportation.commuteNotes = sourcedField(
      "目前僅有直線距離或站點名稱，非可靠通勤時間；直線距離≠通勤時間。",
      {
        sourceIds: ["enrich:transit"],
        confidence: 0.3,
        verificationStatus: "inferred",
        notes: "No Distance Matrix commute minutes available",
      },
    );
    notes.push("交通：僅有直線距離／站點，未提供通勤時間。");
  }

  // Risks
  patch.risks = mapRisks(card);

  // Missing-key hints for common enrich deps
  const missingKey = availability.filter((a) => a.reason === "missing_key");
  if (missingKey.length) {
    notes.push(
      `未設定金鑰：${missingKey.map((a) => a.label).join("、")}（相關生活機能／通勤可能為空）。`,
    );
  }
  const stubs = availability.filter((a) => a.reason === "stub_only");
  if (stubs.length) {
    notes.push(
      `需授權尚未接上：${stubs.map((a) => a.label).join("、")}。`,
    );
  }

  return { notes, patch, availability };
}
