import { describe, expect, it } from "vitest";
import { makeEvidence } from "./evidence";
import { buildReportNarrative, detectSnippetLanguage } from "./narrative";
import { projectFactCardToReport } from "./report";
import { resolveFactCard } from "./resolve";
import { REPORT_SECTION_CATALOG } from "./report-types";

describe("detectSnippetLanguage", () => {
  it("detects English, French, and Chinese", () => {
    expect(detectSnippetLanguage("Listing states monthly HOA fee is $450")).toBe("en");
    expect(
      detectSnippetLanguage("La municipalité indique un impôt foncier annuel."),
    ).toBe("fr");
    expect(detectSnippetLanguage("建物面積約三十坪，管理費另計。")).toBe("zh");
  });
});

describe("buildReportNarrative", () => {
  const now = new Date().toISOString();

  it("emits all 12 fixed zh-Hant sections and only cites existing evidence ids", () => {
    const card = resolveFactCard({
      rawAddress: "123 Main St, Seattle, WA",
      region: "US",
      identityEvidence: [
        makeEvidence({
          lane: "listing",
          field: "normalizedAddress",
          value: "123 main st seattle wa",
          sourceType: "user",
          sourceId: "norm",
          sourceLabel: "Normalizer",
          fetchedAt: now,
          matchLevel: "street",
        }),
        makeEvidence({
          lane: "listing",
          field: "lat",
          value: 47.6,
          sourceType: "public_web",
          sourceId: "nominatim",
          sourceLabel: "Nominatim",
          fetchedAt: now,
        }),
        makeEvidence({
          lane: "listing",
          field: "lng",
          value: -122.3,
          sourceType: "public_web",
          sourceId: "nominatim",
          sourceLabel: "Nominatim",
          fetchedAt: now,
        }),
      ],
      laneEvidence: [
        makeEvidence({
          lane: "building",
          field: "yearBuilt",
          value: 1998,
          sourceType: "licensed_vendor",
          sourceId: "attom",
          sourceLabel: "ATTOM",
          fetchedAt: now,
        }),
      ],
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: true,
    });

    const report = projectFactCardToReport(card);
    const narrative = report.narrative;
    expect(narrative.locale).toBe("zh-Hant");
    expect(narrative.summary_zh).toMatch(/看房摘要/);
    expect(narrative.disclaimer_zh).toMatch(/資訊參考/);
    expect(narrative.sections_zh.map((s) => s.id)).toEqual(
      REPORT_SECTION_CATALOG.map((s) => s.id),
    );

    const knownIds = new Set(report.evidence.map((e) => e.id));
    for (const section of narrative.sections_zh) {
      for (const id of section.evidence_ids) {
        expect(knownIds.has(id)).toBe(true);
      }
    }
    expect(narrative.sections_zh.find((s) => s.id === "property")?.body).toMatch(/1998/);
    expect(narrative.sections_zh.find((s) => s.id === "verification")?.body).toMatch(
      /property\.lot_area|costs\.listing_price|資料缺口/,
    );
    expect(narrative.sections_zh.find((s) => s.id === "confidence")?.body).toMatch(
      /已確認證據/,
    );
    expect(narrative.sections_zh.find((s) => s.id === "condition")?.body).toMatch(/屋況/);
    expect(report.location.dining).toEqual([]);
  });

  it("preserves English and French originals in source_snippets", () => {
    const card = resolveFactCard({
      rawAddress: "1 Main",
      region: "CA",
      identityEvidence: [
        makeEvidence({
          lane: "listing",
          field: "normalizedAddress",
          value: "1 main",
          sourceType: "user",
          sourceId: "norm",
          sourceLabel: "Normalizer",
          fetchedAt: now,
        }),
      ],
      laneEvidence: [
        makeEvidence({
          lane: "hoa",
          field: "managementFee",
          value: "450",
          unit: "CAD",
          sourceType: "listing_claim",
          sourceId: "ex",
          sourceLabel: "example",
          fetchedAt: now,
          evidence: "Listing states monthly HOA fee is $450",
          limitations: "Verify with strata docs",
        }),
      ],
      publicWebEvidence: [
        makeEvidence({
          lane: "listing",
          field: "publicWebSnippet",
          value: "La municipalité indique un impôt foncier annuel.",
          sourceType: "public_web",
          sourceId: "bing",
          sourceLabel: "Bing",
          fetchedAt: now,
          evidence: "La municipalité indique un impôt foncier annuel.",
        }),
      ],
      adapterRuns: [],
      geocodeOk: true,
    });

    const report = projectFactCardToReport(card);
    const snippets = report.narrative.source_snippets;
    expect(snippets.some((s) => s.language === "en" && s.original_text.includes("HOA"))).toBe(
      true,
    );
    expect(
      snippets.some((s) => s.language === "fr" && s.original_text.includes("municipalité")),
    ).toBe(true);

    // Standalone builder matches attached narrative
    expect(buildReportNarrative(report).summary_zh).toBe(report.narrative.summary_zh);
  });
});
