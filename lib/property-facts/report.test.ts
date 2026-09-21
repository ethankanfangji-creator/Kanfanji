import { describe, expect, it } from "vitest";
import { makeEvidence } from "./evidence";
import { projectFactCardToReport } from "./report";
import { resolveFactCard } from "./resolve";

describe("projectFactCardToReport", () => {
  const now = new Date().toISOString();

  it("maps confirmed fields and flattens evidence with ids", () => {
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
          matchLevel: "street",
        }),
        makeEvidence({
          lane: "listing",
          field: "countryCode",
          value: "US",
          sourceType: "public_web",
          sourceId: "nominatim",
          sourceLabel: "Nominatim",
          fetchedAt: now,
          matchLevel: "street",
        }),
        makeEvidence({
          lane: "listing",
          field: "lat",
          value: 47.6,
          sourceType: "public_web",
          sourceId: "nominatim",
          sourceLabel: "Nominatim",
          fetchedAt: now,
          matchLevel: "street",
        }),
        makeEvidence({
          lane: "listing",
          field: "lng",
          value: -122.3,
          sourceType: "public_web",
          sourceId: "nominatim",
          sourceLabel: "Nominatim",
          fetchedAt: now,
          matchLevel: "street",
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
          matchLevel: "street",
        }),
        makeEvidence({
          lane: "listing",
          field: "beds",
          value: 3,
          sourceType: "licensed_vendor",
          sourceId: "attom",
          sourceLabel: "ATTOM",
          fetchedAt: now,
          matchLevel: "street",
        }),
        makeEvidence({
          lane: "market",
          field: "currency",
          value: "USD",
          unit: "USD",
          sourceType: "official",
          sourceId: "iso",
          sourceLabel: "ISO",
          fetchedAt: now,
          matchLevel: "street",
        }),
      ],
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: true,
      jurisdictionKey: "us:wa:king-county:seattle",
    });

    const report = projectFactCardToReport(card);
    expect(report.request.country).toBe("US");
    expect(report.request.coordinates.lat).toBe(47.6);
    expect(report.request.jurisdiction_key).toBe("us:wa:king-county:seattle");
    expect(report.property.year_built).toBe(1998);
    expect(report.property.bedrooms).toBe(3);
    expect(report.property.lot_area).toBeNull();
    expect(report.market.currency).toBe("USD");
    expect(report.costs.listing_price?.status).toBe("not_found");
    expect(report.risks.data_gaps).toEqual(
      expect.arrayContaining(["property.lot_area", "costs.listing_price", "risks.flood"]),
    );
    expect(report.evidence.some((e) => e.field === "year_built" && e.value === 1998)).toBe(
      true,
    );
    expect(report.disclaimer).toMatch(/informational/);
  });

  it("keeps listing-claim HOA as needs_human with basis, not a confirmed cost", () => {
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
      laneEvidence: [
        makeEvidence({
          lane: "hoa",
          field: "managementFee",
          value: "450",
          unit: "USD",
          sourceType: "listing_claim",
          sourceId: "example",
          sourceLabel: "example_source",
          sourceUrl: "https://example.com/record",
          fetchedAt: now,
          effectiveDate: "2026-08-01",
          matchLevel: "exact_unit",
          evidence: "Listing states monthly HOA fee is $450",
          limitations: "May be outdated; verify with HOA resale package",
        }),
      ],
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: true,
    });

    const report = projectFactCardToReport(card);
    const hoa = report.costs.hoa_or_management_fee;
    expect(hoa?.status).toBe("needs_human");
    expect(hoa?.value).toBe("450");
    expect(hoa?.basis).toBe("listing_claim");
    expect(hoa?.evidence_id).toBeTruthy();
    expect(report.risks.data_gaps).toContain("costs.hoa_or_management_fee:needs_human");
    const ev = report.evidence.find((e) => e.id === hoa?.evidence_id);
    expect(ev?.status).toBe("needs_human");
    expect(ev?.source_url).toBe("https://example.com/record");
  });
});
