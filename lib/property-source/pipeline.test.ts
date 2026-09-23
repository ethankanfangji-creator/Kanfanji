import { describe, expect, it } from "vitest";
import { runPropertySourcePipeline } from "./pipeline";
import { extractFactsFromText } from "./extract-text";
import { buildInitialPropertyReport } from "./build-report";
import { createEmptyPropertyData, sourcedField } from "./types";

describe("property source pipeline", () => {
  it("ingests user text and builds a report", async () => {
    const result = await runPropertySourcePipeline({
      sourceType: "user_text",
      text: "台北市大安區忠孝東路 3房2衛 總坪數 30坪 管理費 4500 售價 NT$2200萬 中古屋",
      address: "台北市大安區忠孝東路四段1號",
      locale: "zh-Hant",
    });
    expect(result.source.sourceType).toBe("user_text");
    expect(result.propertyData.listing.bedrooms.value).toBe(3);
    expect(result.report).not.toBeNull();
    expect(result.report?.reportStatus).toMatch(/partial|ready|needs_confirmation/);
    expect(result.steps.find((s) => s.step === "extract")?.status).toBe("completed");
    expect(result.steps.find((s) => s.step === "enrich")?.status).toBe("skipped");
  });

  it("validates missing url", async () => {
    const result = await runPropertySourcePipeline({
      sourceType: "listing_url",
      address: "123 Main St, Seattle, WA 98101",
    });
    expect(result.steps.find((s) => s.step === "validate")?.status).toBe("error");
    expect(result.report).toBeNull();
  });

  it("degrades when enrich fails", async () => {
    const result = await runPropertySourcePipeline({
      sourceType: "user_text",
      text: "3 bed 2 bath asking $500,000",
      address: "100 Main St, Seattle, WA 98101",
      enrich: async () => {
        throw new Error("upstream_down");
      },
    });
    expect(result.report).not.toBeNull();
    expect(result.enrichNotes.join("")).toMatch(/外部|不可用|保留/);
    expect(result.steps.find((s) => s.step === "enrich")?.status).toBe("error");
  });
});

describe("extractFactsFromText markets", () => {
  it("maps Taiwan listing fields", () => {
    const { data } = extractFactsFromText(
      "物件類型：中古屋 3房2衛 25坪 管理費每月5000 售價 NT$1680萬",
      { sourceId: "s1", inputAddress: "高雄市鼓山區" },
    );
    expect(data.listing.bedrooms.value).toBe(3);
    expect(data.costs.hoaOrManagementFee.value).toBeTruthy();
    expect(data.location.country.value).toBe("TW");
  });

  it("maps US listing fields", () => {
    const { data } = extractFactsFromText(
      "Listing price $899,000 4 bedroom 3 bath 2,100 sqft year built 2005 HOA $250",
      { sourceId: "s2", inputAddress: "123 Main St, Austin, TX 78701" },
    );
    expect(data.listing.bedrooms.value).toBe(4);
    expect(data.listing.currency.value).toBe("USD");
  });
});

describe("buildInitialPropertyReport fallback", () => {
  it("returns partial when data is thin", () => {
    const data = createEmptyPropertyData("addr");
    data.location.country = sourcedField("CA", { sourceIds: ["x"] });
    const report = buildInitialPropertyReport({
      address: "1 Robson St, Vancouver, BC",
      data,
      sources: [
        {
          sourceId: "x",
          sourceType: "user_text",
          originalContent: "hello",
          extractedText: "hello",
          sourceUrl: null,
          publisher: null,
          retrievedAt: new Date().toISOString(),
          country: "CA",
          language: "en",
          confidence: 0.4,
          extractionErrors: [],
        },
      ],
    });
    expect(report.reportStatus).toBe("partial");
    expect(report.viewingChecklist.length).toBeGreaterThan(5);
    expect(report.disclaimer.length).toBeGreaterThan(10);
  });
});
