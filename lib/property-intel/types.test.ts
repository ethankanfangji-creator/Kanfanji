import { describe, expect, it } from "vitest";
import { buildRiskTags, detectStrata, walkingMinutesFromMeters } from "./types";

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
