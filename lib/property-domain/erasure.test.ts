import { describe, expect, it, beforeEach } from "vitest";
import { erasePropertyData, requireAuthenticatedEraseUser } from "./erasure";
import {
  persistPropertyReport,
  getReportById,
  reportCacheKeyForAddress,
  PROPERTY_REPORT_API_SCHEMA,
  resetPropertyReportMemoryStore,
  type PropertyReportApiEnvelope,
} from "./persist-report";
import { getPropertyAuditMemory, resetPropertyAuditMemory } from "./audit";

function stubEnvelope(address: string): PropertyReportApiEnvelope {
  return {
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
    normalizedAddress: address,
    country: "US",
    cacheKey: reportCacheKeyForAddress(address),
  };
}

async function persistStub(address: string, createdBy?: string) {
  return persistPropertyReport({
    address,
    createdBy,
    envelope: stubEnvelope(address),
  });
}

describe("erasePropertyData", () => {
  beforeEach(() => {
    resetPropertyReportMemoryStore();
    resetPropertyAuditMemory();
  });

  it("deletes a persisted report and records audit", async () => {
    const created = await persistStub("42 Erase Ave, Seattle, WA");
    expect(await getReportById(created.reportId)).toBeTruthy();

    const erased = await erasePropertyData({
      reportId: created.reportId,
      actor: "user",
    });
    expect(erased.deletedReports).toBe(1);
    expect(await getReportById(created.reportId)).toBeNull();
    expect(getPropertyAuditMemory().some((a) => a.action === "erase")).toBe(true);
  });

  it("rejects guest HTTP erase without a signed-in user", () => {
    expect(() => requireAuthenticatedEraseUser(null)).toThrow(/ai_auth_required/);
    expect(() => requireAuthenticatedEraseUser("")).toThrow(/ai_auth_required/);
    expect(requireAuthenticatedEraseUser("user-a")).toBe("user-a");
  });

  it("does not let another user erase by address or stolen reportId", async () => {
    const address = "99 Owner St, Seattle, WA";
    const owner = await persistStub(address, "user-a");
    const stranger = await persistStub(address, "user-b");

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
    expect(await getReportById(owner.reportId)).toBeTruthy();
    expect(await getReportById(stranger.reportId)).toBeNull();

    const ownerErase = await erasePropertyData({
      reportId: owner.reportId,
      actor: "user",
      actorUserId: "user-a",
    });
    expect(ownerErase.deletedReports).toBe(1);
    expect(await getReportById(owner.reportId)).toBeNull();
  });
});
