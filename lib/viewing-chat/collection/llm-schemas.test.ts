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
