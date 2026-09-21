import { describe, expect, it } from "vitest";
import { buildAddressMatch } from "./match";
import { emptyFactCard, resolveFactCard } from "./resolve";
import { makeEvidence } from "./evidence";
import { foundField } from "./evidence";

describe("buildAddressMatch", () => {
  const now = new Date().toISOString();

  it("promotes parcel + unit to exact_unit", () => {
    const card = emptyFactCard("1 Main #2", "US");
    card.identity.placeId = foundField("ChIJtest", {
      sourceClass: "licensed",
      sourceType: "licensed_vendor",
      sourceId: "google",
      sourceLabel: "Google",
      fetchedAt: now,
      expiresAt: now,
      confidence: 0.9,
      matchLevel: "street",
    });
    card.parcel.pid = foundField("PID-1", {
      sourceClass: "official",
      sourceType: "official",
      sourceId: "metro",
      sourceLabel: "Metro",
      fetchedAt: now,
      expiresAt: now,
      confidence: 0.97,
      matchLevel: "exact_parcel",
    });
    card.parcel.parcelId = card.parcel.pid;
    card.identity.unitHint = foundField("Unit 2", {
      sourceClass: "user",
      sourceType: "user",
      sourceId: "norm",
      sourceLabel: "Normalizer",
      fetchedAt: now,
      expiresAt: now,
      confidence: 0.7,
      matchLevel: "exact_unit",
    });

    const match = buildAddressMatch(card);
    expect(match.level).toBe("exact_unit");
    expect(match.parcelId).toBe("PID-1");
    expect(match.unitId).toBe("Unit 2");
    expect(match.placeId).toBe("ChIJtest");
    expect(match.listingId).toBeNull();
  });

  it("falls back to street when only geocode identity exists", () => {
    const card = resolveFactCard({
      rawAddress: "123 Main",
      region: "US",
      identityEvidence: [
        makeEvidence({
          lane: "listing",
          field: "streetName",
          value: "Main St",
          sourceType: "licensed_vendor",
          sourceId: "google",
          sourceLabel: "Google",
          fetchedAt: now,
          matchLevel: "street",
        }),
        makeEvidence({
          lane: "listing",
          field: "normalizedAddress",
          value: "123 main",
          sourceType: "user",
          sourceId: "norm",
          sourceLabel: "Normalizer",
          fetchedAt: now,
        }),
      ],
      laneEvidence: [],
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: true,
    });
    expect(card.meta.match?.level).toBe("street");
    expect(card.meta.match?.notes.some((n) => n.includes("parcel_id"))).toBe(true);
  });
});
