import { describe, expect, it, beforeEach } from "vitest";
import { deriveJurisdiction, jurisdictionKey } from "@/lib/property-facts/jurisdiction";
import type { GeocodingProvider } from "@/lib/property-facts/interfaces";
import type { GeocodeResult } from "@/lib/property-facts/geocode";
import { MemoryEvidenceStore } from "@/lib/property-facts/services/evidence-store";
import { REPORT_SECTION_CATALOG } from "@/lib/property-facts/report-types";
import { createPropertyReportApi } from "./create-report-api";
import {
  getEvidenceByReport,
  getReportById,
  resetPropertyReportMemoryStore,
} from "./persist-report";

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

describe("createPropertyReportApi + persist", () => {
  beforeEach(() => {
    resetPropertyReportMemoryStore();
  });

  it("persists reportId and serves GET-equivalent by id + evidence", async () => {
    const created = await createPropertyReportApi("1 Main St, Seattle, WA", {
      bypassCache: true,
      deps: {
        geocoding: fakeUsGeocoder(),
        evidenceStore: new MemoryEvidenceStore(),
      },
    });

    expect(created.body.reportId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(created.body.links.self).toContain(created.body.reportId);
    expect(created.body.stages.country).toBe("US");
    expect(created.body.report?.narrative.sections_zh.map((s) => s.id)).toEqual(
      REPORT_SECTION_CATALOG.map((s) => s.id),
    );
    expect(created.body.factCard).toBeNull();

    const loaded = await getReportById(created.body.reportId);
    expect(loaded?.reportId).toBe(created.body.reportId);
    expect(loaded?.envelope.markdown).toMatch(/看房報告/);

    const firstEv = created.body.report?.evidence[0];
    if (firstEv) {
      const ev = await getEvidenceByReport(created.body.reportId, firstEv.id);
      expect(ev?.id).toBe(firstEv.id);
      expect(ev?.field).toBe(firstEv.field);
    }
  });

  it("reuses L2 cache on second call without bypass", async () => {
    const deps = {
      geocoding: fakeUsGeocoder(),
      evidenceStore: new MemoryEvidenceStore(),
    };
    const first = await createPropertyReportApi("99 Pine St, Seattle, WA", {
      bypassCache: true,
      deps,
    });
    const second = await createPropertyReportApi("99 Pine St, Seattle, WA", {
      bypassCache: false,
      deps,
    });
    expect(second.body.reportId).toBe(first.body.reportId);
    expect(second.body.cache.hit).toBe(true);
    expect(second.generated).toBeNull();
  });
});
