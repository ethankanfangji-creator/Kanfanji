import { describe, expect, it } from "vitest";
import {
  convertArea,
  convertCurrencyApprox,
  detectAreaUnitFromText,
  detectCurrencyFromText,
} from "./units";
import {
  detectMarketFromAddress,
  mapExtractedLabelToMarketField,
  marketSpecificTemplate,
} from "./market-fields";
import {
  detectValueConflicts,
  mergeSourcedFieldPreferHigherConfidence,
  scoreDataCompleteness,
} from "./completeness";
import { createEmptyPropertyData, sourcedField } from "./types";
import { parseInitialPropertyReport } from "./initial-report-schema";

describe("units", () => {
  it("converts area between sqft, sqm, ping", () => {
    const sqm = convertArea(100, "ping", "sqm");
    expect(sqm).toBeCloseTo(100 / 0.3025, 3);
    expect(convertArea(sqm, "sqm", "ping")).toBeCloseTo(100, 2);
    expect(convertArea(1000, "sqft", "sqft")).toBe(1000);
  });

  it("detects currency and area from text", () => {
    expect(detectCurrencyFromText("售價 NT$1,200萬")).toBe("TWD");
    expect(detectCurrencyFromText("Asking CAD 899,000")).toBe("CAD");
    expect(detectAreaUnitFromText("主建物 25 坪")).toBe("ping");
    expect(detectAreaUnitFromText("1,200 sqft")).toBe("sqft");
  });

  it("marks FX as illustrative", () => {
    const r = convertCurrencyApprox(100, "USD", "TWD");
    expect(r.assumption).toContain("illustrative");
    expect(r.amount).toBeGreaterThan(100);
  });
});

describe("market fields", () => {
  it("detects US / CA / TW addresses", () => {
    expect(detectMarketFromAddress("123 Main St, Seattle, WA 98101")).toBe("US");
    expect(detectMarketFromAddress("456 Granville St, Vancouver, BC V6C 1V4")).toBe(
      "CA",
    );
    expect(detectMarketFromAddress("台北市大安區忠孝東路四段1號")).toBe("TW");
  });

  it("maps labels to marketSpecific keys", () => {
    expect(mapExtractedLabelToMarketField("US", "HOA fee")).toBe("hoaFee");
    expect(mapExtractedLabelToMarketField("TW", "公設比")).toBe("commonAreaRatio");
    expect(Object.keys(marketSpecificTemplate("CA")).length).toBeGreaterThan(3);
  });
});

describe("completeness and conflicts", () => {
  it("scores missing vs filled fields", () => {
    const data = createEmptyPropertyData("x");
    data.listing.price = sourcedField("100", { verificationStatus: "unverified" });
    data.location.country = sourcedField("TW", { verificationStatus: "verified" });
    const s = scoreDataCompleteness(data);
    expect(s.verifiedFields).toContain("location.country");
    expect(s.unverifiedFields).toContain("listing.price");
    expect(s.missingFields.length).toBeGreaterThan(0);
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBeLessThan(1);
  });

  it("detects multi-source conflicts", () => {
    const conflicts = detectValueConflicts([
      { path: "listing.price", value: "100", sourceId: "a" },
      { path: "listing.price", value: "200", sourceId: "b" },
      { path: "listing.bedrooms", value: 3, sourceId: "a" },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].path).toBe("listing.price");
  });

  it("marks merge conflicts", () => {
    const merged = mergeSourcedFieldPreferHigherConfidence(
      sourcedField("A", { sourceIds: ["1"], confidence: 0.9 }),
      sourcedField("B", { sourceIds: ["2"], confidence: 0.8 }),
    );
    expect(merged.verificationStatus).toBe("conflicting");
  });
});

describe("initial report schema", () => {
  it("accepts a partial report payload", () => {
    const result = parseInitialPropertyReport({
      reportStatus: "partial",
      propertySummary: {},
      dataCompleteness: {
        score: 0.2,
        missingFields: ["listing.price"],
        verifiedFields: [],
        unverifiedFields: [],
      },
      sections: [],
      risks: [],
      questionsToAsk: [],
      viewingChecklist: [],
      nextActions: [],
      sources: [],
      disclaimer: "test",
    });
    expect(result.ok).toBe(true);
  });
});
