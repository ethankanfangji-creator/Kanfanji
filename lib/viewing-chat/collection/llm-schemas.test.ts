import { describe, expect, it } from "vitest";
import { ChatReportLlmSchema, parseLlmJson, PolishReplySchema } from "./llm-schemas";
import { resolveFieldDisplayStatus } from "./field-display";

describe("parseLlmJson", () => {
  it("accepts valid polish reply", () => {
    const raw = JSON.stringify({ assistantMessage: "已記下開價。" });
    const result = parseLlmJson(raw, PolishReplySchema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.assistantMessage).toMatch(/開價/);
  });

  it("marks invalid polish as failed and keeps raw", () => {
    const raw = '{"assistantMessage": 123}';
    const result = parseLlmJson(raw, PolishReplySchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.raw).toBe(raw);
      expect(result.error).toBeTruthy();
    }
  });

  it("rejects malformed JSON for report", () => {
    const result = parseLlmJson("not-json", ChatReportLlmSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.raw).toBe("not-json");
  });

  it("accepts ChatGPT-template sectioned report JSON with scores", () => {
    const raw = JSON.stringify({
      title: "1167 Victory Drive — 看房評估報告",
      meta: { askingPrice: "$1.5M", yearBuilt: null },
      overview: "Land-forward.",
      interior: "Kitchen ok.",
      outdoorLand: "Big lot.",
      transitLifestyle: "Bus.",
      pricing: "Negotiate.",
      pros: ["Land"],
      risks: ["Age"],
      scores: {
        items: [
          { label: "土地", score: 5 },
          { label: "交通", score: 3.5 },
        ],
        overall: "約 8/10",
        highlight: "土地大",
        biggestQuestion: "價格合理嗎",
      },
      verdict: "Diligence first.",
      nextSteps: ["Pull comps"],
    });
    const result = parseLlmJson(raw, ChatReportLlmSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.scores?.items?.[0]?.score).toBe(5);
      expect(result.data.scores?.biggestQuestion).toMatch(/價格/);
      expect(result.data.outdoorLand).toMatch(/Big lot/);
    }
  });
});

describe("resolveFieldDisplayStatus", () => {
  it("distinguishes confirmed fact vs subjective vs inferred vs skipped", () => {
    expect(
      resolveFieldDisplayStatus({
        fieldId: "price",
        status: "confirmed",
        value: 1_280_0000,
        skippedFields: [],
      }),
    ).toBe("confirmed");

    expect(
      resolveFieldDisplayStatus({
        fieldId: "noise",
        status: "confirmed",
        value: "有點吵",
        skippedFields: [],
      }),
    ).toBe("subjective");

    expect(
      resolveFieldDisplayStatus({
        fieldId: "area",
        status: "inferred",
        value: 30,
        skippedFields: [],
      }),
    ).toBe("inferred");

    expect(
      resolveFieldDisplayStatus({
        fieldId: "area",
        status: "unknown",
        value: null,
        skippedFields: [],
      }),
    ).toBe("missing");

    expect(
      resolveFieldDisplayStatus({
        fieldId: "area",
        status: "confirmed",
        value: 30,
        skippedFields: ["area"],
      }),
    ).toBe("skipped");
  });
});
