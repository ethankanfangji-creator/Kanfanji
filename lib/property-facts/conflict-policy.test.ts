import { describe, expect, it } from "vitest";
import { makeEvidence } from "./evidence";
import { compareEvidence, decideEvidenceWinner } from "./conflict-policy";
import { resolveFactCard } from "./resolve";
import type { Evidence } from "./types";

describe("compareEvidence", () => {
  const now = new Date().toISOString();

  it("prefers exact_parcel over street", () => {
    const exact = makeEvidence({
      lane: "parcel",
      field: "pid",
      value: "A",
      sourceType: "official",
      sourceId: "a",
      sourceLabel: "A",
      fetchedAt: now,
      matchLevel: "exact_parcel",
    });
    const street = makeEvidence({
      lane: "parcel",
      field: "pid",
      value: "B",
      sourceType: "official",
      sourceId: "b",
      sourceLabel: "B",
      fetchedAt: now,
      matchLevel: "street",
    });
    expect(compareEvidence(exact, street)).toBeLessThan(0);
  });

  it("prefers official over licensed at same match", () => {
    const official = makeEvidence({
      lane: "building",
      field: "yearBuilt",
      value: 1990,
      sourceType: "official",
      sourceId: "gov",
      sourceLabel: "Gov",
      fetchedAt: now,
      matchLevel: "street",
    });
    const licensed = makeEvidence({
      lane: "building",
      field: "yearBuilt",
      value: 1991,
      sourceType: "licensed_vendor",
      sourceId: "attom",
      sourceLabel: "ATTOM",
      fetchedAt: now,
      matchLevel: "street",
    });
    expect(compareEvidence(official, licensed)).toBeLessThan(0);
  });

  it("prefers licensed over public_web", () => {
    const licensed = makeEvidence({
      lane: "listing",
      field: "beds",
      value: 3,
      sourceType: "licensed_vendor",
      sourceId: "a",
      sourceLabel: "A",
      fetchedAt: now,
    });
    const web = makeEvidence({
      lane: "listing",
      field: "beds",
      value: 2,
      sourceType: "public_web",
      sourceId: "b",
      sourceLabel: "B",
      fetchedAt: now,
    });
    expect(compareEvidence(licensed, web)).toBeLessThan(0);
  });

  it("prefers newer effectiveDate when otherwise tied", () => {
    const older = makeEvidence({
      lane: "listing",
      field: "beds",
      value: 2,
      sourceType: "licensed_vendor",
      sourceId: "a",
      sourceLabel: "A",
      fetchedAt: now,
      effectiveDate: "2020-01-01",
      matchLevel: "street",
    });
    const newer = makeEvidence({
      lane: "listing",
      field: "beds",
      value: 3,
      sourceType: "licensed_vendor",
      sourceId: "b",
      sourceLabel: "B",
      fetchedAt: now,
      effectiveDate: "2024-06-01",
      matchLevel: "street",
    });
    expect(compareEvidence(newer, older)).toBeLessThan(0);
  });
});

describe("decideEvidenceWinner unresolved conflict", () => {
  const now = new Date().toISOString();

  it("does not pick when policy-tied values disagree", () => {
    const a = makeEvidence({
      lane: "building",
      field: "yearBuilt",
      value: 1990,
      sourceType: "licensed_vendor",
      sourceId: "a",
      sourceLabel: "A",
      fetchedAt: now,
      effectiveDate: "2024-01-01",
      matchLevel: "street",
    });
    const b = makeEvidence({
      lane: "building",
      field: "yearBuilt",
      value: 1991,
      sourceType: "licensed_vendor",
      sourceId: "b",
      sourceLabel: "B",
      fetchedAt: now,
      effectiveDate: "2024-01-01",
      matchLevel: "street",
    });
    // Force identical asOf by same effectiveDate; same match + source type → tie
    const decision = decideEvidenceWinner([a, b] as Evidence<number>[]);
    expect(decision.kind).toBe("unresolved_conflict");
    if (decision.kind === "unresolved_conflict") {
      expect(decision.candidates).toHaveLength(2);
    }
  });
});

describe("resolveFactCard conflict policy", () => {
  const now = new Date().toISOString();

  it("exact match beats street when values differ", () => {
    const card = resolveFactCard({
      rawAddress: "1 Main",
      region: "US",
      identityEvidence: [],
      laneEvidence: [
        makeEvidence({
          lane: "parcel",
          field: "pid",
          value: "STREET-PID",
          sourceType: "official",
          sourceId: "a",
          sourceLabel: "A",
          fetchedAt: now,
          matchLevel: "street",
        }),
        makeEvidence({
          lane: "parcel",
          field: "pid",
          value: "EXACT-PID",
          sourceType: "official",
          sourceId: "b",
          sourceLabel: "B",
          fetchedAt: now,
          matchLevel: "exact_parcel",
        }),
      ],
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: true,
    });
    expect(card.parcel.pid.status).toBe("found");
    expect(card.parcel.pid.value).toBe("EXACT-PID");
    expect(card.parcel.pid.conflicts?.length).toBe(1);
  });

  it("unresolved tie keeps conflict status with null value", () => {
    const card = resolveFactCard({
      rawAddress: "1 Main",
      region: "US",
      identityEvidence: [],
      laneEvidence: [
        makeEvidence({
          lane: "building",
          field: "yearBuilt",
          value: 1990,
          sourceType: "licensed_vendor",
          sourceId: "a",
          sourceLabel: "A",
          fetchedAt: now,
          effectiveDate: "2024-01-01",
          matchLevel: "street",
        }),
        makeEvidence({
          lane: "building",
          field: "yearBuilt",
          value: 1992,
          sourceType: "licensed_vendor",
          sourceId: "b",
          sourceLabel: "B",
          fetchedAt: now,
          effectiveDate: "2024-01-01",
          matchLevel: "street",
        }),
      ],
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: true,
    });
    expect(card.building.yearBuilt.status).toBe("conflict");
    expect(card.building.yearBuilt.value).toBeNull();
    expect(card.building.yearBuilt.conflicts?.length).toBe(2);
    expect(card.building.yearBuilt.estimated).toBe(false);
  });

  it("marks area_statistic as estimated needs_human, not found", () => {
    const card = resolveFactCard({
      rawAddress: "x",
      region: "US",
      identityEvidence: [],
      laneEvidence: [
        makeEvidence({
          lane: "market",
          field: "priceRange",
          value: "500-600k",
          sourceType: "area_statistic",
          sourceId: "stat",
          sourceLabel: "Area",
          fetchedAt: now,
        }),
      ],
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: true,
    });
    expect(card.market.priceRange.status).toBe("needs_human");
    expect(card.market.priceRange.estimated).toBe(true);
    expect(card.market.priceRange.value).toBe("500-600k");
  });
});
