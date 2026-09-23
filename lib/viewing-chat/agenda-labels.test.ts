import { describe, expect, it } from "vitest";
import { stripMarketPrefix } from "./agenda-labels";

describe("stripMarketPrefix", () => {
  it("removes zh and en market tags", () => {
    expect(stripMarketPrefix("（台）壁癌有沒有？")).toBe("壁癌有沒有？");
    expect(stripMarketPrefix("（加）Strata 準備金？")).toBe("Strata 準備金？");
    expect(stripMarketPrefix("（美）HOA 特別攤派？")).toBe("HOA 特別攤派？");
    expect(stripMarketPrefix("(US) Ask for disclosures?")).toBe("Ask for disclosures?");
    expect(stripMarketPrefix("(CA) Strata reserves?")).toBe("Strata reserves?");
    expect(stripMarketPrefix("(TW) Rain revisit?")).toBe("Rain revisit?");
  });

  it("leaves unprefixed questions alone", () => {
    expect(stripMarketPrefix("外觀有無明顯問題？")).toBe("外觀有無明顯問題？");
  });
});
