import { describe, expect, it } from "vitest";
import { detectSuggestRegion, suggestAddresses } from "./address-suggest";

describe("suggestAddresses", () => {
  it("returns empty for short queries without calling upstream", async () => {
    await expect(suggestAddresses("ab")).resolves.toEqual([]);
    await expect(suggestAddresses("  ")).resolves.toEqual([]);
  });
});

describe("detectSuggestRegion", () => {
  it("detects US street + ZIP with comma after state", () => {
    expect(detectSuggestRegion("2436 S Leah St, Visalia, CA, 93292")).toBe("US");
    expect(detectSuggestRegion("2436 S Leah St, Visalia, CA 93292")).toBe("US");
  });

  it("detects BC / Canada cues", () => {
    expect(detectSuggestRegion("123 Main St, Burnaby, BC")).toBe("CA");
  });

  it("detects Taiwan cues", () => {
    expect(detectSuggestRegion("台北市信義路五段7號")).toBe("TW");
  });
});
