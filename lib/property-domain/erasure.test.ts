import { describe, expect, it, beforeEach } from "vitest";
import { deriveJurisdiction, jurisdictionKey } from "@/lib/property-facts/jurisdiction";
import type { GeocodingProvider } from "@/lib/property-facts/interfaces";
import type { GeocodeResult } from "@/lib/property-facts/geocode";
import { MemoryEvidenceStore } from "@/lib/property-facts/services/evidence-store";
import { createPropertyReportApi } from "./create-report-api";
import {
  eraseDeletesSharedIntelCache,
  erasePropertyData,
  requireAuthenticatedEraseUser,
} from "./erasure";
import {
  getReportById,
  persistPropertyReport,
  PROPERTY_REPORT_API_SCHEMA,
  reportCacheKeyForAddress,
  resetPropertyReportMemoryStore,
  type PropertyReportApiEnvelope,
} from "./persist-report";
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

  it("rejects guest HTTP erase without a signed-in user", () => {
    expect(() => requireAuthenticatedEraseUser(null)).toThrow(/ai_auth_required/);
    expect(() => requireAuthenticatedEraseUser("")).toThrow(/ai_auth_required/);
    expect(requireAuthenticatedEraseUser("user-a")).toBe("user-a");
    expect(eraseDeletesSharedIntelCache(undefined)).toBe(true);
    expect(eraseDeletesSharedIntelCache("user-a")).toBe(false);
  });

  it("does not let another user erase by address or stolen reportId, and leaves shared intel alone", async () => {
    const address = "99 Owner St, Seattle, WA";
    const envelope = (ownerAddress: string): PropertyReportApiEnvelope => ({
      schemaVersion: PROPERTY_REPORT_API_SCHEMA,
      stages: {
        normalized: true,
        geocoded: true,
        country: "US",
        providersUsed: [],
        providersSkipped: [],
        dataGapCount: 0,
        domainValid: false,
      },
      report: null,
      domainReport: null,
      markdown: null,
      normalizedAddress: ownerAddress,
      country: "US",
      cacheKey: reportCacheKeyForAddress(ownerAddress),
    });
    const owner = await persistPropertyReport({
      address,
      createdBy: "user-a",
      envelope: envelope(address),
    });
    const stranger = await persistPropertyReport({
      address,
      createdBy: "user-b",
      envelope: envelope(address),
    });

    await expect(
      erasePropertyData({
        reportId: owner.reportId,
        actor: "user",
        actorUserId: "user-b",
      }),
    ).rejects.toMatchObject({ code: "report_not_found", status: 404 });

    const byAddress = await erasePropertyData({
      address,
      actor: "user",
      actorUserId: "user-b",
    });
    expect(byAddress.reportIds).toContain(stranger.reportId);
    expect(byAddress.reportIds).not.toContain(owner.reportId);
    expect(byAddress.deletedIntelCache).toBe(0);
    expect(await getReportById(owner.reportId)).toBeTruthy();
    expect(await getReportById(stranger.reportId)).toBeNull();

    const ownerErase = await erasePropertyData({
      reportId: owner.reportId,
      actor: "user",
      actorUserId: "user-a",
    });
    expect(ownerErase.deletedReports).toBe(1);
    expect(ownerErase.deletedIntelCache).toBe(0);
    expect(await getReportById(owner.reportId)).toBeNull();
  });
});
