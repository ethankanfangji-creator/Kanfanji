import { describe, expect, it } from "vitest";
import { assertCitations, extractEvidenceIds, sanitizeCitedStrings } from "./citations";
import { buildReportCompliance } from "./compliance";
import { makeEvidence } from "./evidence";
import { projectFactCardToReport } from "./report";
import { resolveFactCard } from "./resolve";

describe("citations", () => {
  it("extracts bracket and fullwidth citation forms", () => {
    expect(extractEvidenceIds("建造年 1998〔ev_1_year_built〕 and [ev_2_beds]")).toEqual([
      "ev_1_year_built",
      "ev_2_beds",
    ]);
  });

  it("strips unknown evidence ids", () => {
    const result = assertCitations("價格約 500 萬〔ev_fake_price〕確認〔ev_1_year_built〕", [
      "ev_1_year_built",
    ]);
    expect(result.ok).toBe(false);
    expect(result.unknownIds).toEqual(["ev_fake_price"]);
    expect(result.strippedText).not.toMatch(/ev_fake/);
    expect(result.strippedText).toMatch(/ev_1_year_built/);
  });

  it("sanitizes string lists for chat reports", () => {
    const { values, unknownIds } = sanitizeCitedStrings(
      ["好採光 [ev_ok_a]", "稅金 [ev_bad_x]"],
      ["ev_ok_a"],
    );
    expect(unknownIds).toEqual(["ev_bad_x"]);
    expect(values[0]).toMatch(/ev_ok_a/);
    expect(values[1]).not.toMatch(/ev_bad/);
  });
});

describe("compliance on report", () => {
  const now = new Date().toISOString();

  it("sets no_scraping and human verification for listing-claim HOA", () => {
    const card = resolveFactCard({
      rawAddress: "1 Main",
      region: "US",
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
          sourceType: "listing_claim",
          sourceId: "ex",
          sourceLabel: "example",
          fetchedAt: now,
          evidence: "Listing states monthly HOA fee is $450",
        }),
      ],
      publicWebEvidence: [],
      adapterRuns: [],
      geocodeOk: true,
      providersUsed: [],
      providersSkipped: [{ id: "attom", reason: "missing_key" }],
    });

    const report = projectFactCardToReport(card);
    expect(report.compliance.no_scraping).toBe(true);
    expect(report.compliance.notices.some((n) => /不(主動)?爬取|does not (proactively )?scrape/i.test(n))).toBe(true);
    expect(report.compliance.human_verification.required).toBe(true);
    expect(
      report.compliance.human_verification.checklist.some((c) => c.id === "verify_hoa_condo"),
    ).toBe(true);
    expect(report.compliance.providers_skipped.some((s) => s.id === "attom")).toBe(true);

    const compliance = buildReportCompliance(card);
    expect(compliance.no_scraping).toBe(true);
  });
});
