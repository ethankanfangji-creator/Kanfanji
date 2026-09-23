import { describe, expect, it } from "vitest";
import { scoreConfidence } from "./confidence";
import { deriveJurisdiction, isBcMetroMunicipality, jurisdictionKey } from "./jurisdiction";

describe("jurisdiction routing", () => {
  it("splits US by state, county, and city", () => {
    const king = deriveJurisdiction({
      region: "US",
      query: "500 5th Ave, Seattle, King County, WA 98104",
      admin1: "WA",
      city: "Seattle",
      county: "King County",
    });
    const pierce = deriveJurisdiction({
      region: "US",
      query: "100 Main, Tacoma, Pierce County, WA",
      admin1: "WA",
      city: "Tacoma",
      county: "Pierce County",
    });
    expect(jurisdictionKey(king, "parcel")).toContain("king-county");
    expect(jurisdictionKey(king, "parcel")).not.toBe(jurisdictionKey(pierce, "parcel"));
  });

  it("splits Canada by province and municipality", () => {
    const vancouver = deriveJurisdiction({
      region: "CA",
      query: "123 Main St, Vancouver, BC",
      admin1: "British Columbia",
      city: "Vancouver",
    });
    const toronto = deriveJurisdiction({
      region: "CA",
      query: "100 King St, Toronto, ON",
      admin1: "Ontario",
      city: "Toronto",
    });
    expect(vancouver.admin1).toBe("BC");
    expect(isBcMetroMunicipality(vancouver)).toBe(true);
    expect(isBcMetroMunicipality(toronto)).toBe(false);
    expect(jurisdictionKey(vancouver, "zoning")).not.toBe(jurisdictionKey(toronto, "zoning"));
  });

  it("splits Taiwan by city, district, and section", () => {
    const a = deriveJurisdiction({
      region: "TW",
      query: "臺北市大安區信義段 7 號",
    });
    const b = deriveJurisdiction({
      region: "TW",
      query: "高雄市前金區中山段 12 號",
    });
    expect(a.district).toBe("大安區");
    expect(a.section).toBe("信義段");
    expect(a.doorplate).toBe("7號");
    expect(jurisdictionKey(a, "parcel")).not.toBe(jurisdictionKey(b, "parcel"));
  });
});

describe("confidence bands", () => {
  const now = new Date().toISOString();

  it("scores fresh official exact matches in the top band", () => {
    const score = scoreConfidence({
      sourceType: "official",
      matchLevel: "exact_parcel",
      retrievedAt: now,
    });
    expect(score).toBeGreaterThanOrEqual(0.95);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("scores a fresh licensed exact match in the licensed band", () => {
    const score = scoreConfidence({
      sourceType: "licensed_listing",
      matchLevel: "exact_unit",
      retrievedAt: now,
    });
    expect(score).toBeGreaterThanOrEqual(0.8);
    expect(score).toBeLessThan(0.95);
  });

  it("keeps model estimates and conflicts out of the confirmed bands", () => {
    expect(
      scoreConfidence({
        sourceType: "model_estimate",
        matchLevel: "inferred",
        retrievedAt: now,
      }),
    ).toBeLessThanOrEqual(0.39);
    expect(
      scoreConfidence({
        sourceType: "official",
        matchLevel: "exact_parcel",
        retrievedAt: now,
        conflict: true,
      }),
    ).toBeLessThanOrEqual(0.59);
  });
});
