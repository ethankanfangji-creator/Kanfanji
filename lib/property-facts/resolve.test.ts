import { describe, expect, it } from "vitest";
import { makeEvidence } from "./evidence";
import { normalizeAddressQuery } from "./normalize-address";
import { emptyFactCard, resolveFactCard } from "./resolve";
import { projectFactCardToIntel, projectFactCardToBasics } from "./project";
import type { Evidence } from "./types";

describe("normalizeAddressQuery", () => {
  it("canonicalizes TW characters and floors", () => {
    const r = normalizeAddressQuery("台北市大安區信義路三段 五樓");
    expect(r.normalizedQuery).toContain("臺北");
    expect(r.normalizedQuery).toMatch(/5樓/);
  });

  it("extracts unit hint", () => {
    const r = normalizeAddressQuery("123 Main St Unit 4, Vancouver BC");
    expect(r.unitHint).toMatch(/Unit 4/i);
  });
});

describe("resolveFactCard precedence + conflicts", () => {
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 1000).toISOString();

  it("prefers official over licensed and keeps conflicts", () => {
    const evidence: Evidence<unknown>[] = [
      makeEvidence({
        lane: "building",
        field: "yearBuilt",
        value: 1990,
        sourceClass: "licensed",
        sourceId: "attom",
        sourceLabel: "ATTOM",
        fetchedAt: now,
      }),
      makeEvidence({
        lane: "building",
        field: "yearBuilt",
        value: 1988,
        sourceClass: "official",
        sourceId: "gov",
        sourceLabel: "Gov",
        fetchedAt: later,
      }),
    ];

    const card = resolveFactCard({
      rawAddress: "1 Test St",
      region: "US",
      identityEvidence: [
        makeEvidence({
          lane: "listing",
          field: "normalizedAddress",
          value: "1 test st",
          sourceClass: "user",
          sourceId: "norm",
          sourceLabel: "Normalizer",
          fetchedAt: now,
        }),
      ],
      laneEvidence: evidence,
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: true,
    });

    expect(card.building.yearBuilt.status).toBe("found");
    expect(card.building.yearBuilt.value).toBe(1988);
    expect(card.building.yearBuilt.sourceClass).toBe("official");
    expect(card.building.yearBuilt.confidence).toBeLessThanOrEqual(0.59);
    expect(card.building.yearBuilt.conflicts?.length).toBe(1);
    expect(card.building.yearBuilt.conflicts?.[0]?.value).toBe(1990);
  });

  it("never promotes model_estimate to found — marks estimated needs_human", () => {
    const evidence: Evidence<unknown>[] = [
      makeEvidence({
        lane: "building",
        field: "yearBuilt",
        value: 2001,
        sourceClass: "model_estimate",
        sourceType: "model_estimate",
        sourceId: "llm",
        sourceLabel: "LLM",
        fetchedAt: now,
      }),
    ];
    const card = resolveFactCard({
      rawAddress: "x",
      region: "CA",
      identityEvidence: [],
      laneEvidence: evidence,
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: false,
    });
    expect(card.building.yearBuilt.status).toBe("needs_human");
    expect(card.building.yearBuilt.estimated).toBe(true);
    expect(card.building.yearBuilt.value).toBe(2001);
  });

  it("marks missing fields not_found explicitly", () => {
    const card = emptyFactCard("somewhere", "TW");
    expect(card.hoa.managementFee.status).toBe("not_found");
    expect(card.parcel.propertyTax.status).toBe("not_found");
    expect(card.listing.beds.status).toBe("not_found");
    expect(card.meta.coverageSummary.notFound).toBeGreaterThan(0);
  });

  it("same priority prefers newer fetchedAt", () => {
    const evidence: Evidence<unknown>[] = [
      makeEvidence({
        lane: "listing",
        field: "beds",
        value: 2,
        sourceClass: "licensed",
        sourceId: "a",
        sourceLabel: "A",
        fetchedAt: now,
      }),
      makeEvidence({
        lane: "listing",
        field: "beds",
        value: 3,
        sourceClass: "licensed",
        sourceId: "b",
        sourceLabel: "B",
        fetchedAt: later,
      }),
    ];
    const card = resolveFactCard({
      rawAddress: "x",
      region: "US",
      identityEvidence: [],
      laneEvidence: evidence,
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: true,
    });
    expect(card.listing.beds.value).toBe(3);
  });

  it("keeps a listing claim as needs_human and caps confidence below confirmed", () => {
    const now = new Date().toISOString();
    const card = resolveFactCard({
      rawAddress: "1 Main",
      region: "US",
      identityEvidence: [],
      laneEvidence: [
        makeEvidence({
          lane: "hoa",
          field: "managementFee",
          value: "450",
          unit: "USD",
          sourceType: "listing_claim",
          sourceId: "example_listing",
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
    expect(card.hoa.managementFee.status).toBe("needs_human");
    expect(card.hoa.managementFee.value).toBe("450");
    expect(card.hoa.managementFee.unit).toBe("USD");
    expect(card.hoa.managementFee.confidence).toBeLessThanOrEqual(0.82);
    expect(card.hoa.managementFee.confidence).toBeGreaterThanOrEqual(0.8);
    expect(card.hoa.managementFee.limitations).toMatch(/HOA|房源宣稱|outdated/i);
  });

  it("caps confidence when sources conflict", () => {
    const now = new Date().toISOString();
    const later = new Date(Date.now() + 1000).toISOString();
    const card = resolveFactCard({
      rawAddress: "1 Main",
      region: "US",
      identityEvidence: [],
      laneEvidence: [
        makeEvidence({
          lane: "building",
          field: "yearBuilt",
          value: 1990,
          sourceType: "official",
          sourceId: "a",
          sourceLabel: "A",
          fetchedAt: now,
          matchLevel: "exact_parcel",
        }),
        makeEvidence({
          lane: "building",
          field: "yearBuilt",
          value: 2001,
          sourceType: "official",
          sourceId: "b",
          sourceLabel: "B",
          fetchedAt: later,
          matchLevel: "exact_parcel",
        }),
      ],
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: true,
    });
    expect(card.building.yearBuilt.status).toBe("found");
    expect(card.building.yearBuilt.confidence).toBeLessThanOrEqual(0.59);
  });
});

describe("projectFactCard — no invent", () => {
  it("projects only found values into intel", () => {
    const now = new Date().toISOString();
    const card = resolveFactCard({
      rawAddress: "台北市信義路",
      region: "TW",
      identityEvidence: [
        makeEvidence({
          lane: "listing",
          field: "normalizedAddress",
          value: "臺北市信義路",
          sourceClass: "user",
          sourceId: "norm",
          sourceLabel: "Normalizer",
          fetchedAt: now,
        }),
        makeEvidence({
          lane: "listing",
          field: "countryCode",
          value: "TW",
          sourceClass: "public_web",
          sourceId: "nominatim",
          sourceLabel: "Nominatim",
          fetchedAt: now,
        }),
      ],
      laneEvidence: [
        makeEvidence({
          lane: "market",
          field: "currency",
          value: "TWD",
          sourceClass: "official",
          sourceId: "region_default",
          sourceLabel: "Region default",
          fetchedAt: now,
        }),
      ],
      publicWebEvidence: [
        makeEvidence({
          lane: "listing",
          field: "public_web_snippet",
          value: "某網站寫成交價 5000萬",
          sourceClass: "public_web",
          sourceId: "bing",
          sourceLabel: "Bing",
          fetchedAt: now,
          rawRef: "https://example.com",
        }),
      ],
      adapterRuns: [],
      geocodeOk: true,
    });

    const intel = projectFactCardToIntel(card);
    expect(intel.market.region).toBe("TW");
    expect(intel.market.currency).toBe("TWD");
    expect(intel.basic.year).toBeNull();
    expect(intel.basic.beds).toBeNull();
    expect(intel.history.last_sold).toBeNull();

    const basics = projectFactCardToBasics(card);
    expect(basics.price.value).toBeNull();
    expect(basics.price.note).toBe("not_found");
    expect(basics.yearBuilt.value).toBeNull();
  });
});
