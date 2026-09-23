import { describe, expect, it } from "vitest";
import { applyCollectionSkip, applyCollectionTurn } from "./apply-turn";
import { createEmptyPropertyRecord } from "./merge-property-facts";

describe("applyCollectionTurn", () => {
  it("fills multiple fields and asks up to three follow-ups", () => {
    const result = applyCollectionTurn({
      text:
        "地址：台北市大安區信義路四段100號。3房2廳，開價1280萬。" +
        "優點採光不錯，缺點屋齡偏老。",
      messageId: "m1",
      record: createEmptyPropertyRecord(),
      evidence: [],
      skippedFields: [],
    });

    expect(result.matched.length).toBeGreaterThanOrEqual(3);
    expect(result.nextQuestions.length).toBeLessThanOrEqual(3);
    expect(result.replyText).toMatch(/幫你記到|還想跟你確認/);
    expect(result.record.fields.price?.value).toBe(12_800_000);
  });

  it("enters confirming mode on 整理一下 and returns no questions", () => {
    const seeded = applyCollectionTurn({
      text: "開價 980 萬，兩房",
      messageId: "m1",
      record: createEmptyPropertyRecord(),
      evidence: [],
      skippedFields: [],
    });
    const wrap = applyCollectionTurn({
      text: "整理一下",
      messageId: "m2",
      record: seeded.record,
      evidence: seeded.evidence,
      skippedFields: seeded.skippedFields,
    });
    expect(wrap.intent).toBe("request_summary");
    expect(wrap.record.mode).toBe("confirming");
    expect(wrap.nextQuestions).toEqual([]);
    expect(wrap.replyText).toMatch(/整理|報告/);
  });

  it("records mid-turn noise without requiring it to be the active question", () => {
    const result = applyCollectionTurn({
      text: "坪數之後再補，陽台外有高架很吵",
      messageId: "m1",
      record: createEmptyPropertyRecord({
        fields: {
          address: {
            fieldId: "address",
            value: "somewhere",
            status: "confirmed",
            confidence: 0.9,
            sourceMessageId: null,
            rawText: "somewhere",
            updatedAt: new Date().toISOString(),
          },
        },
      }),
      evidence: [],
      skippedFields: [],
    });
    expect(result.record.fields.noise?.rawText).toMatch(/高架|吵/);
    expect(result.matched.some((m) => m.id === "q_noise")).toBe(true);
  });
});

describe("applyCollectionSkip", () => {
  it("skips a field and returns other follow-ups", () => {
    const record = createEmptyPropertyRecord({
      fields: {
        address: {
          fieldId: "address",
          value: "台北",
          status: "confirmed",
          confidence: 0.9,
          sourceMessageId: null,
          rawText: "台北",
          updatedAt: new Date().toISOString(),
        },
      },
    });
    const skipped = applyCollectionSkip({
      record,
      evidence: [],
      skippedFields: [],
      skipId: "q_noise",
    });
    expect(skipped.skippedFields).toContain("noise");
    expect(skipped.nextQuestions.every((q) => q.fieldId !== "noise")).toBe(true);
    expect(skipped.nextQuestions.length).toBeLessThanOrEqual(3);
  });
});
