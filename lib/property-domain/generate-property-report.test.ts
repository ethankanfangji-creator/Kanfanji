import { describe, expect, it } from "vitest";
import { deriveJurisdiction, jurisdictionKey } from "@/lib/property-facts/jurisdiction";
import type { GeocodingProvider } from "@/lib/property-facts/interfaces";
import type { GeocodeResult } from "@/lib/property-facts/geocode";
import { MemoryEvidenceStore } from "@/lib/property-facts/services/evidence-store";
import { generatePropertyReport } from "./generate-property-report";
import { markdownCitationErrors, renderPropertyReportMarkdown } from "./markdown-report";
import { DOMAIN_SCHEMA_VERSION } from "./models";

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

describe("generatePropertyReport", () => {
  it("runs the full flow with a fake geocoder", async () => {
    const result = await generatePropertyReport("1 Main St, Seattle, WA", {
      bypassCache: true,
      deps: {
        geocoding: fakeUsGeocoder(),
        evidenceStore: new MemoryEvidenceStore(),
      },
    });

    expect(result.stages.normalized).toBe(true);
    expect(result.stages.geocoded).toBe(true);
    expect(result.stages.country).toBe("US");
    expect(result.report).toBeTruthy();
    expect(result.domainReport?.schemaVersion).toBe(DOMAIN_SCHEMA_VERSION);
    expect(result.stages.domainValid).toBe(true);
    expect(result.markdown).toMatch(/# 看房報告/);
    expect(result.markdown).toMatch(/目錄/);
    expect(result.markdown).toMatch(/未確認事項|資料缺口/);
    expect(result.markdown).toMatch(/免責/);
    expect(result.markdown).toMatch(/生活機能/);
    expect(result.markdown).toMatch(/資料可信度/);

    const bad = markdownCitationErrors(
      result.markdown!,
      result.report!.evidence.map((e) => e.id),
    );
    expect(bad).toEqual([]);
  });

  it("handles empty address without throwing", async () => {
    const result = await generatePropertyReport("   ", {
      bypassCache: true,
      deps: { evidenceStore: new MemoryEvidenceStore() },
    });
    expect(result.stages.geocoded).toBe(false);
    expect(result.markdown).toMatch(/看房報告/);
  });

  it("can omit markdown", async () => {
    const result = await generatePropertyReport("1 Main", {
      bypassCache: true,
      includeMarkdown: false,
      deps: {
        geocoding: fakeUsGeocoder(),
        evidenceStore: new MemoryEvidenceStore(),
      },
    });
    expect(result.markdown).toBeNull();
    expect(result.report).toBeTruthy();
  });
});

describe("renderPropertyReportMarkdown", () => {
  it("includes disclaimer and gap section from a minimal legacy report shape", async () => {
    const result = await generatePropertyReport("1 Main St, Seattle, WA", {
      bypassCache: true,
      deps: {
        geocoding: fakeUsGeocoder(),
        evidenceStore: new MemoryEvidenceStore(),
      },
    });
    const md = renderPropertyReportMarkdown({
      legacy: result.report!,
      domain: result.domainReport,
    });
    expect(md).toMatch(/免責聲明/);
    expect(md).toMatch(/## 目錄/);
    for (const title of [
      "地址與座標",
      "房屋／建物摘要",
      "屋況與翻修證據",
      "生活機能",
      "交通",
      "資料可信度",
      "未確認事項與建議的人工查證清單",
    ]) {
      expect(md).toContain(title);
    }
  });
});
