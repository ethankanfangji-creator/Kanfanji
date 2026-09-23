import { describe, expect, it } from "vitest";
import { propertyIntelCacheKey } from "./cache-key";
import { canonicalizeAddressQuery } from "./normalize-query";
import {
  buildRiskTags,
  detectMarketRegion,
  detectStrata,
  emptyIntel,
  looksLikeUnitLevelAddress,
  walkingMinutesFromMeters,
} from "./types";
import { extractTwMarketFromSnippets } from "./neighborhood";
import { buildStreetViewUrl } from "./street-view";

describe("property-intel risks", () => {
  it("flags federal-era systems before 1980", () => {
    expect(buildRiskTags(1972, true)).toEqual(
      expect.arrayContaining(["Federal Pioneer 電箱", "Poly-B 水管", "雨幕漏水 (2000年前)"]),
    );
  });

  it("uses lighter tags for 1980s", () => {
    expect(buildRiskTags(1985, false)).toEqual(["鋁線", "Poly-B", "單層窗"]);
  });

  it("detects strata from fee or type", () => {
    expect(detectStrata("Townhouse", null)).toBe(true);
    expect(detectStrata("House", "$320/m")).toBe(true);
    expect(detectStrata("House", null)).toBe(false);
  });

  it("estimates walking minutes", () => {
    expect(walkingMinutesFromMeters(640)).toBe(8);
  });
});

describe("property-intel normalize + cache key", () => {
  it("unifies 台/臺 and Chinese floors for the same cache key", () => {
    const a = canonicalizeAddressQuery("台北市信義路五段7號三樓");
    const b = canonicalizeAddressQuery("臺北市信義路五段7號3樓");
    expect(a).toContain("臺北");
    expect(a).toContain("3樓");
    expect(propertyIntelCacheKey(a)).toBe(propertyIntelCacheKey(b));
  });

  it("detects unit-level addresses", () => {
    expect(looksLikeUnitLevelAddress("臺北市信義路五段7號12樓")).toBe(true);
    expect(looksLikeUnitLevelAddress("123 Main St, Burnaby, BC")).toBe(false);
  });
});

describe("property-intel region + market", () => {
  it("detects TW / CA / US from address", () => {
    expect(detectMarketRegion("台北市大安區敦化南路")).toBe("TW");
    expect(detectMarketRegion("123 Main St, Burnaby, BC")).toBe("CA");
    expect(detectMarketRegion("500 5th Ave, Seattle, WA 98104")).toBe("US");
  });

  it("extracts TW unit price from snippets", () => {
    const tw = extractTwMarketFromSnippets([
      {
        title: "實價登錄",
        snippet: "單價 85 萬/坪，總價 2800 萬，建商 遠雄，公設比 32%",
        url: "https://example.com",
        query: "test",
      },
    ]);
    expect(tw.market.avgUnitPrice).toMatch(/萬/);
    expect(tw.neighborhood.builder).toBe("遠雄");
    expect(tw.neighborhood.amenityRatio).toMatch(/32/);
  });

  it("empty intel includes visuals, market, compliance slots", () => {
    const intel = emptyIntel("x", "x");
    expect(intel.visuals.streetViewUrl).toBeNull();
    expect(intel.market.region).toBeNull();
    expect(intel.location.amenities).toEqual([]);
    expect(intel.compliance.streetViewNotice).toBe(false);
    expect(intel.normalizedQuery).toBe("x");
  });

  it("street view url is null without API key", () => {
    const prev = process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_STREET_VIEW_API_KEY;
    expect(buildStreetViewUrl(49.28, -123.12)).toBeNull();
    if (prev) process.env.GOOGLE_MAPS_API_KEY = prev;
  });
});
