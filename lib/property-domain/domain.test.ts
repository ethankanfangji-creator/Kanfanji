import { describe, expect, it } from "vitest";
import { makeEvidence } from "@/lib/property-facts/evidence";
import { resolveFactCard } from "@/lib/property-facts/resolve";
import { projectFactCardToReport } from "@/lib/property-facts/report";
import { toDomainPropertyReport, safeToDomainPropertyReport } from "./adapt";
import { DOMAIN_SCHEMA_VERSION } from "./models";
import { emptyProvenanced, foundProvenanced } from "./provenance";
import {
  DomainPropertyReportSchema,
  EvidenceSchema,
  provenancedSchema,
  assertEvidenceCited,
} from "./schemas";
import type { DomainPropertyReport, Evidence } from "./models";
import { z } from "zod";

describe("provenancedSchema", () => {
  const Num = provenancedSchema(z.number());

  it("accepts a found value with evidence ids", () => {
    const parsed = Num.parse(
      foundProvenanced(1998, {
        source: "ATTOM",
        confidence: 0.9,
        evidenceIds: ["ev_1_year_built"],
        unit: null,
      }),
    );
    expect(parsed.value).toBe(1998);
    expect(assertEvidenceCited(parsed, "yearBuilt")).toBeNull();
  });

  it("flags found non-null without evidence ids", () => {
    const field = foundProvenanced(3, { evidenceIds: [] });
    expect(assertEvidenceCited(field, "bedrooms")).toMatch(/evidenceIds/);
  });
});

describe("DomainPropertyReportSchema", () => {
  it("rejects listing price found without evidenceIds", () => {
    const base = minimalDomainReport();
    base.listing.price = foundProvenanced("500000", {
      source: "listing_claim",
      evidenceIds: [],
      confidence: 0.5,
    });
    const result = DomainPropertyReportSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it("accepts needs_human HOA with evidence id", () => {
    const base = minimalDomainReport();
    base.evidence.push({
      id: "ev_hoa",
      field: "hoa",
      value: "450",
      unit: "USD",
      source: "listing_claim",
      sourceUrl: "https://example.com",
      retrievedAt: new Date().toISOString(),
      effectiveDate: null,
      confidence: 0.6,
      evidence: "Listing states HOA $450",
      limitations: "Verify",
      status: "needs_human" as const,
      matchLevel: "exact_unit",
    });
    base.hoa.amount = {
      ...emptyProvenanced("needs_human"),
      value: "450",
      status: "needs_human",
      source: "listing_claim",
      evidenceIds: ["ev_hoa"],
      confidence: 0.6,
    };
    const result = DomainPropertyReportSchema.safeParse(base);
    expect(result.success).toBe(true);
  });
});

describe("toDomainPropertyReport adapter", () => {
  const now = new Date().toISOString();

  it("maps FactCard through legacy report into domain schema", () => {
    const card = resolveFactCard({
      rawAddress: "123 Main St, Seattle, WA",
      region: "US",
      identityEvidence: [
        makeEvidence({
          lane: "listing",
          field: "normalizedAddress",
          value: "123 main st seattle wa",
          sourceType: "user",
          sourceId: "norm",
          sourceLabel: "Normalizer",
          fetchedAt: now,
        }),
        makeEvidence({
          lane: "listing",
          field: "lat",
          value: 47.6,
          sourceType: "public_web",
          sourceId: "nominatim",
          sourceLabel: "Nominatim",
          fetchedAt: now,
        }),
        makeEvidence({
          lane: "listing",
          field: "lng",
          value: -122.3,
          sourceType: "public_web",
          sourceId: "nominatim",
          sourceLabel: "Nominatim",
          fetchedAt: now,
        }),
      ],
      laneEvidence: [
        makeEvidence({
          lane: "building",
          field: "yearBuilt",
          value: 1998,
          sourceType: "licensed_vendor",
          sourceId: "attom",
          sourceLabel: "ATTOM",
          fetchedAt: now,
        }),
        makeEvidence({
          lane: "hoa",
          field: "managementFee",
          value: "450",
          unit: "USD",
          sourceType: "listing_claim",
          sourceId: "ex",
          sourceLabel: "example",
          fetchedAt: now,
          evidence: "Listing states monthly HOA fee is $450",
        }),
      ],
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: true,
      countryAdapter: {
        id: "UnitedStatesAdapter",
        region: "US",
        units: {
          area: "sqft",
          currency: "USD",
          feeLabel: "HOA",
          feeLabelZh: "HOA",
        },
        available_data_types: ["listing"],
        providers_preferred: ["attom"],
        providers_disabled: [],
        provider_reasons: {},
        structural_gaps: ["risks.flood"],
        legal_notices: ["No scraping"],
        fee_label: "HOA",
        fee_label_zh: "HOA",
        localized_labels: { locale: "zh-Hant", labels: {} },
      },
    });

    const domain = toDomainPropertyReport(card);
    expect(domain.schemaVersion).toBe(DOMAIN_SCHEMA_VERSION);
    expect(domain.property.yearBuilt.value).toBe(1998);
    expect(domain.property.yearBuilt.evidenceIds.length).toBeGreaterThan(0);
    expect(domain.hoa.amount.status).toBe("needs_human");
    expect(domain.hoa.amount.evidenceIds.length).toBeGreaterThan(0);
    expect(domain.dataGaps.some((g) => g.fieldPath.includes("flood") || g.reason)).toBe(
      true,
    );
    expect(domain.adapter?.id).toBe("UnitedStatesAdapter");
    expect(domain.transactions).toEqual([]);
    expect(domain.comparables).toEqual([]);

    const legacy = projectFactCardToReport(card);
    expect(domain.evidence.length).toBe(legacy.evidence.length);
  });

  it("safeToDomainPropertyReport returns ok for valid cards", () => {
    const card = resolveFactCard({
      rawAddress: "1 Main",
      region: "US",
      identityEvidence: [
        makeEvidence({
          lane: "listing",
          field: "normalizedAddress",
          value: "1 main",
          sourceType: "user",
          sourceId: "norm",
          sourceLabel: "Normalizer",
          fetchedAt: now,
        }),
      ],
      laneEvidence: [],
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: false,
    });
    const result = safeToDomainPropertyReport(card);
    expect(result.ok).toBe(true);
  });
});

describe("EvidenceSchema", () => {
  it("requires id", () => {
    expect(
      EvidenceSchema.safeParse({
        id: "",
        field: "x",
        value: 1,
        unit: null,
        source: null,
        sourceUrl: null,
        retrievedAt: null,
        effectiveDate: null,
        confidence: null,
        evidence: null,
        limitations: null,
        status: "found",
        matchLevel: null,
      }).success,
    ).toBe(false);
  });
});

function minimalDomainReport(): DomainPropertyReport {
  const emptyStr = () => emptyProvenanced<string>();
  const emptyNum = () => emptyProvenanced<number>();
  const evidence: Evidence[] = [];
  return {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    address: {
      input: "x",
      normalized: emptyStr(),
      display: emptyStr(),
      components: {
        streetNumber: emptyStr(),
        streetName: emptyStr(),
        city: emptyStr(),
        admin1: emptyStr(),
        county: emptyStr(),
        district: emptyStr(),
        section: emptyStr(),
        doorplate: emptyStr(),
        postalCode: emptyStr(),
        country: emptyStr(),
      },
      placeId: emptyStr(),
      jurisdictionKey: emptyStr(),
      unitHint: emptyStr(),
    },
    geocoding: {
      lat: emptyNum(),
      lng: emptyNum(),
      provider: emptyStr(),
      matchLevel: emptyStr(),
      displayAddress: emptyStr(),
      geocodeOk: false,
    },
    property: {
      propertyType: emptyStr(),
      yearBuilt: emptyNum(),
      buildingArea: emptyNum(),
      lotArea: emptyNum(),
      bedrooms: emptyNum(),
      bathrooms: emptyNum(),
      parking: emptyStr(),
      condition: emptyStr(),
      parcelId: emptyStr(),
      buildingId: emptyStr(),
    },
    listing: {
      listingId: emptyStr(),
      price: emptyStr(),
      status: emptyStr(),
      propertyType: emptyStr(),
      bedrooms: emptyNum(),
      bathrooms: emptyNum(),
      area: emptyNum(),
      currency: emptyStr(),
    },
    transactions: [],
    permits: [],
    assessment: {
      assessedValue: emptyStr(),
      assessedYear: emptyStr(),
      rollNumber: emptyStr(),
      currency: emptyStr(),
    },
    tax: {
      amount: emptyStr(),
      taxYear: emptyStr(),
      jurisdiction: emptyStr(),
      currency: emptyStr(),
    },
    hoa: {
      amount: emptyStr(),
      period: emptyStr(),
      feeKind: emptyProvenanced<"hoa" | "strata" | "condo" | "management" | "other">(),
      currency: emptyStr(),
    },
    zoning: {
      code: emptyStr(),
      label: emptyStr(),
      landUse: emptyStr(),
    },
    nearby: [],
    transit: [],
    comparables: [],
    risks: [],
    evidence,
    dataGaps: [{ fieldPath: "parcel", reason: "not_found" as const, note: null }],
    adapter: null,
    disclaimer: "info only",
    narrativeSummaryZh: null,
  };
}
