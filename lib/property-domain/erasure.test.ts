import { describe, expect, it, beforeEach } from "vitest";
import { deriveJurisdiction, jurisdictionKey } from "@/lib/property-facts/jurisdiction";
import type { GeocodingProvider } from "@/lib/property-facts/interfaces";
import type { GeocodeResult } from "@/lib/property-facts/geocode";
import { MemoryEvidenceStore } from "@/lib/property-facts/services/evidence-store";
import { createPropertyReportApi } from "./create-report-api";
import { erasePropertyData } from "./erasure";
import { getReportById, resetPropertyReportMemoryStore } from "./persist-report";
import { getPropertyAuditMemory, resetPropertyAuditMemory } from "./audit";

function fakeUsGeocoder(): GeocodingProvider {
  return {
    async geocode(query): Promise<GeocodeResult> {
      const jurisdiction = deriveJurisdiction({
        region: "US",
        query,
        admin1: "WA",
        city: "Seattle",
        county: "King",
      });
      return {
        region: "US",
        displayAddress: "1 Main St, Seattle, WA",
        countryCode: "US",
        admin1: "WA",
        city: "Seattle",
        postalCode: null,
        jurisdiction,
        jurisdictionKey: jurisdictionKey(jurisdiction),
        lat: 47.6,
        lng: -122.3,
        placeId: null,
        streetNumber: "1",
        streetName: "Main St",
        geocodeOk: true,
        identityEvidence: [],
        sourceId: "fake_geocoder",
      };
    },
  };
}

describe("erasePropertyData", () => {
  beforeEach(() => {
    resetPropertyReportMemoryStore();
    resetPropertyAuditMemory();
  });

  it("deletes a persisted report and records audit", async () => {
    const created = await createPropertyReportApi("42 Erase Ave, Seattle, WA", {
      bypassCache: true,
      deps: {
        geocoding: fakeUsGeocoder(),
        evidenceStore: new MemoryEvidenceStore(),
      },
    });
    expect(await getReportById(created.body.reportId)).toBeTruthy();

    const erased = await erasePropertyData({
      reportId: created.body.reportId,
      actor: "user",
    });
    expect(erased.deletedReports).toBe(1);
    expect(await getReportById(created.body.reportId)).toBeNull();
    expect(getPropertyAuditMemory().some((a) => a.action === "erase")).toBe(true);
    expect(getPropertyAuditMemory().some((a) => a.action === "generate")).toBe(true);
  });
});
