import { describe, expect, it } from "vitest";
import { enrichPropertyDataFromFactCard } from "./enrich-from-facts";
import { emptyFactCard } from "@/lib/property-facts/resolve";
import { makeEvidence } from "@/lib/property-facts/evidence";
import { resolveFactCard } from "@/lib/property-facts/resolve";

describe("enrichPropertyDataFromFactCard", () => {
  const now = new Date().toISOString();

  it("maps POI / transit / HOA / tax into PropertyData as unverified", () => {
    const card = resolveFactCard({
      rawAddress: "123 Main St, Seattle, WA 98101",
      region: "US",
      identityEvidence: [
        makeEvidence({
          lane: "listing",
          field: "normalizedAddress",
          value: "123 Main St, Seattle, WA 98101",
          sourceType: "public_web",
          sourceId: "geo",
          sourceLabel: "Geocode",
          fetchedAt: now,
        }),
        makeEvidence({
          lane: "listing",
          field: "lat",
          value: 47.6,
          sourceType: "public_web",
          sourceId: "geo",
          sourceLabel: "Geocode",
          fetchedAt: now,
        }),
        makeEvidence({
          lane: "listing",
          field: "lng",
          value: -122.3,
          sourceType: "public_web",
          sourceId: "geo",
          sourceLabel: "Geocode",
          fetchedAt: now,
        }),
      ],
      laneEvidence: [
        makeEvidence({
          lane: "hoa",
          field: "managementFee",
          value: "$350/mo",
          sourceType: "listing_claim",
          sourceId: "hoa1",
          sourceLabel: "Listing",
          fetchedAt: now,
        }),
        makeEvidence({
          lane: "parcel",
          field: "propertyTax",
          value: "$6,200/yr",
          sourceType: "public_record",
          sourceId: "tax1",
          sourceLabel: "Tax",
          fetchedAt: now,
        }),
        makeEvidence({
          lane: "poi",
          field: "supermarket",
          value: "Whole Foods 0.4 mi",
          sourceType: "public_web",
          sourceId: "poi1",
          sourceLabel: "Places",
          fetchedAt: now,
        }),
        makeEvidence({
          lane: "poi",
          field: "schools",
          value: ["Lincoln High"],
          sourceType: "public_web",
          sourceId: "poi1",
          sourceLabel: "Places",
          fetchedAt: now,
        }),
        makeEvidence({
          lane: "transit",
          field: "rail",
          value: "University St Station",
          sourceType: "public_web",
          sourceId: "tr1",
          sourceLabel: "Transit",
          fetchedAt: now,
        }),
        makeEvidence({
          lane: "risk",
          field: "flood",
          value: "Zone X — verify FEMA map",
          sourceType: "public_web",
          sourceId: "rk1",
          sourceLabel: "Risk",
          fetchedAt: now,
        }),
      ],
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: true,
      providersUsed: [{ id: "google_maps", kind: "geocode", auth_scope: "maps" }],
      providersSkipped: [{ id: "attom", reason: "missing_key" }],
    });

    const { patch, notes } = enrichPropertyDataFromFactCard(card);
    expect(patch.costs.hoaOrManagementFee.value).toMatch(/350/);
    expect(patch.costs.hoaOrManagementFee.verificationStatus).toBe("unverified");
    expect(patch.costs.propertyTax.value).toMatch(/6,200/);
    expect(patch.neighborhood.grocery.value).toMatch(/Whole Foods/);
    expect(patch.neighborhood.schools.value).toMatch(/Lincoln/);
    expect(patch.transportation.nearestTransit.value).toMatch(/University/);
    expect(patch.transportation.commuteNotes.value).toMatch(/直線距離|通勤/);
    expect(patch.risks.some((r) => /flood|FEMA|Zone/i.test(r.description))).toBe(
      true,
    );
    expect(notes.join("")).toMatch(/google_maps|ATTOM|未設定金鑰|已嘗試/i);
  });

  it("notes missing keys on empty card with skipped providers", () => {
    const card = emptyFactCard("1 Robson St, Vancouver, BC", "CA");
    card.meta.providersSkipped = [
      { id: "google_maps", reason: "missing_key" },
      { id: "mls_crea_ddf", reason: "stub_only" },
    ];
    const { notes, patch } = enrichPropertyDataFromFactCard(card);
    expect(patch.neighborhood.grocery.value).toBeNull();
    expect(notes.join("")).toMatch(/未設定金鑰|尚未接上|Google/i);
  });
});
