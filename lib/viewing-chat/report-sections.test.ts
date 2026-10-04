import { describe, expect, it } from "vitest";
import {
  assembleReportSummary,
  formatStars,
  hasSectionedReport,
  normalizeReportMeta,
  normalizeReportScores,
  reportFollowUpsForLegacy,
} from "./report-sections";

describe("report-sections", () => {
  it("normalizes meta and detects sectioned reports", () => {
    expect(normalizeReportMeta({ askingPrice: " $1.5M ", yearBuilt: "" })).toEqual({
      viewingDate: null,
      propertyType: null,
      yearBuilt: null,
      askingPrice: "$1.5M",
      lotSize: null,
      interiorSize: null,
      layout: null,
      neighborhood: null,
    });
    expect(hasSectionedReport({ overview: "hello" })).toBe(true);
    expect(
      hasSectionedReport({
        scores: { items: [{ label: "土地", score: 5 }], overall: "8/10" },
      }),
    ).toBe(true);
  });

  it("normalizes scores and formats stars", () => {
    expect(formatStars(3.5)).toBe("★★★½☆");
    expect(normalizeReportScores({
      items: [
        { label: "土地", score: 5 },
        { label: "交通", score: 3.5 },
        { label: "bad", score: 9 },
      ],
      overall: "約 8/10",
      highlight: "土地大",
      biggestQuestion: "價格合理嗎",
    })).toEqual({
      items: [
        { label: "土地", score: 5 },
        { label: "交通", score: 3.5 },
        { label: "bad", score: 5 },
      ],
      overall: "約 8/10",
      highlight: "土地大",
      biggestQuestion: "價格合理嗎",
    });
  });

  it("assembles markdown with scorecard and without 目前卡點", () => {
    const md = assembleReportSummary({
      title: "1167 Victory Drive — 看房評估報告",
      meta: { askingPrice: "$1.5M", lotSize: "8290 sqft" },
      overview: "Land + family home.",
      pros: ["Land"],
      risks: ["Age"],
      scores: {
        items: [{ label: "土地", score: 5 }],
        overall: "約 8/10",
        highlight: "土地大",
        biggestQuestion: "可比成交",
      },
      nextSteps: ["Pull comps"],
    });
    expect(md).toContain("# 1167 Victory Drive");
    expect(md).toContain("## 初步評分");
    expect(md).toContain("**最大亮點：** 土地大");
    expect(md).toContain("**最大疑問：** 可比成交");
    expect(md).not.toContain("目前卡點");
    expect(md).not.toContain("What's stopping you");
    expect(md).toContain("## 下一步");
  });

  it("maps followUps for legacy share from nextSteps", () => {
    expect(
      reportFollowUpsForLegacy({
        pros: [],
        risks: [],
        followUps: ["old"],
        checklist: [],
        nextSteps: ["step"],
        scores: { items: [], biggestQuestion: "q" },
        generatedAt: "",
      }),
    ).toEqual(["step"]);
  });
});
