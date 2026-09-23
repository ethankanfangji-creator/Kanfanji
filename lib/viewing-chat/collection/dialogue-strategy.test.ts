import { describe, expect, it } from "vitest";
import {
  clarifyQuestionForField,
  compositeQuestion,
  confirmQuestion,
  depthBandForTurn,
  isVagueUtterance,
  isYesUtterance,
  preferredFieldsForDepth,
  resolvePendingConfirm,
} from "./dialogue-strategy";
import { createConversationState, processUserTurn } from "./process-user-turn";
import { getNextQuestions } from "./get-next-questions";
import { createEmptyPropertyRecord } from "./merge-property-facts";

describe("dialogue strategies", () => {
  it("招3: detects vague utterances", () => {
    expect(isVagueUtterance("還好")).toBe(true);
    expect(isVagueUtterance("普通")).toBe(true);
    expect(isVagueUtterance("Federal")).toBe(false);
  });

  it("招3: vague answer stays low-confidence and asks clarify", async () => {
    const conversation = createConversationState({ address: "台北" });
    conversation.focusFieldIds = ["water_damage"];
    const result = await processUserTurn({
      conversation,
      message: { id: "v1", text: "還好" },
    });
    expect(result.updatedRecord.fields.water_damage?.confidence).toBeLessThanOrEqual(
      0.25,
    );
    expect(result.updatedRecord.fields.water_damage?.status).toBe("inferred");
    expect(result.suggestedQuestions.some((q) => q.kind === "clarify")).toBe(
      true,
    );
    expect(result.assistantMessage).toMatch(/籠統|確認|漏水|翻新|還好/);
  });

  it("招1: yes confirms pending candidate", async () => {
    const conversation = createConversationState({ address: "台北" });
    conversation.pendingConfirm = {
      fieldId: "electrical",
      candidateValue: "Federal Pioneer",
      source: "vision",
    };
    const result = await processUserTurn({
      conversation,
      message: { id: "y1", text: "對" },
    });
    expect(result.updatedRecord.fields.electrical?.value).toBe("Federal Pioneer");
    expect(result.updatedRecord.fields.electrical?.status).toBe("confirmed");
    expect(result.pendingConfirm).toBeNull();
  });

  it("招1: no clears candidate without keeping wrong value", async () => {
    const conversation = createConversationState({ address: "台北" });
    conversation.pendingConfirm = {
      fieldId: "electrical",
      candidateValue: "Federal",
      source: "inferred",
    };
    conversation.record.fields.electrical = {
      fieldId: "electrical",
      value: "Federal",
      status: "inferred",
      confidence: 0.6,
      sourceMessageId: null,
      rawText: "Federal",
      updatedAt: new Date().toISOString(),
    };
    const result = await processUserTurn({
      conversation,
      message: { id: "n1", text: "不是" },
    });
    expect(result.updatedRecord.fields.electrical?.status).toBe("unknown");
    expect(result.updatedRecord.fields.electrical?.value).toBeNull();
  });

  it("招1+B: leading 不對 + remainder maps to other slots", async () => {
    const conversation = createConversationState({ address: "台北" });
    conversation.pendingConfirm = {
      fieldId: "transit",
      candidateValue: "Mairie 1 分",
      source: "inferred",
    };
    conversation.record.fields.transit = {
      fieldId: "transit",
      value: "Mairie 1 分",
      status: "inferred",
      confidence: 0.55,
      sourceMessageId: null,
      rawText: "Mairie",
      updatedAt: new Date().toISOString(),
    };
    conversation.focusFieldIds = ["amenities", "water_damage"];
    const result = await processUserTurn({
      conversation,
      message: { id: "mix1", text: "不對 好像沒有公設" },
    });
    expect(result.updatedRecord.fields.transit?.status).toBe("unknown");
    expect(result.updatedRecord.fields.amenities?.value).toMatch(/沒有公設|公設/);
    expect(result.changes.some((c) => c.fieldId === "amenities")).toBe(true);
  });

  it("freeform while confirm open: files remark, no transit conflict, does not re-trap", async () => {
    const conversation = createConversationState({ address: "Saint-Clar" });
    conversation.pendingConfirm = {
      fieldId: "transit",
      candidateValue: "Mairie - Saint-Clar-De-Riviere 1 分",
      source: "inferred",
    };
    conversation.focusFieldIds = ["transit"];
    conversation.record.fields.transit = {
      fieldId: "transit",
      value: "Mairie - Saint-Clar-De-Riviere 1 分",
      status: "inferred",
      confidence: 0.6,
      sourceMessageId: null,
      rawText: "Mairie",
      updatedAt: new Date().toISOString(),
    };
    const result = await processUserTurn({
      conversation,
      message: { id: "reno1", text: "裝潢狠心ㄟ" },
    });
    expect(result.updatedRecord.fields.transit?.value).toBe(
      "Mairie - Saint-Clar-De-Riviere 1 分",
    );
    expect(result.updatedRecord.fields.transit?.hasConflict).not.toBe(true);
    expect(result.changes.some((c) => c.kind === "conflict")).toBe(false);
    expect(result.updatedRecord.fields.pros?.value).toMatch(/裝潢/);
    expect(result.suggestedQuestions.some((q) => q.kind === "confirm")).toBe(
      false,
    );
    expect(result.pendingConfirm?.fieldId).toBe("transit");
    expect(result.assistantMessage).not.toMatch(/【交通】/);
    expect(result.assistantMessage).toMatch(/聽懂|收下|對上|裝潢|優點/);
  });

  it("confirm turn does not mix open questions in the same bubble", () => {
    const record = createEmptyPropertyRecord({ mode: "collecting" });
    record.fields.transit = {
      fieldId: "transit",
      value: "Mairie 1分",
      status: "inferred",
      confidence: 0.6,
      sourceMessageId: null,
      rawText: "Mairie",
      updatedAt: new Date().toISOString(),
    };
    const qs = getNextQuestions({
      record,
      evidence: [],
      skippedFields: [],
      locale: "zh-Hant",
      userTurnCount: 2,
      pendingConfirm: {
        fieldId: "transit",
        candidateValue: "Mairie 1分",
        source: "inferred",
      },
    });
    expect(qs).toHaveLength(1);
    expect(qs[0]?.kind).toBe("confirm");
    expect(qs[0]?.fieldId).toBe("transit");
  });

  it("招1: builds confirm question from candidate", () => {
    const q = confirmQuestion({
      fieldId: "electrical",
      candidateValue: "Federal",
      source: "vision",
    });
    expect(q).toMatch(/Federal/);
    expect(q).toMatch(/對|不是/);
  });

  it("招2: composite question covers multiple slots", () => {
    const q = compositeQuestion(
      ["amenities", "water_damage", "plumbing"],
      "zh-Hant",
    );
    expect(q).toMatch(/廚房|浴室/);
    expect(q).toMatch(/水壓|漏水/);
  });

  it("招2: getNextQuestions can emit composite kind", () => {
    const record = createEmptyPropertyRecord({ address: "x", mode: "collecting" });
    const qs = getNextQuestions({
      record,
      evidence: [],
      skippedFields: [],
      locale: "zh-Hant",
      userTurnCount: 2,
    });
    expect(qs.some((q) => q.kind === "composite" || q.kind === "open")).toBe(
      true,
    );
  });

  it("招4: depth bands progress by turn", () => {
    expect(depthBandForTurn(1)).toBe("condition");
    expect(depthBandForTurn(3)).toBe("condition");
    expect(depthBandForTurn(4)).toBe("livability");
    expect(depthBandForTurn(7)).toBe("geo");
    expect(preferredFieldsForDepth(2).has("electrical")).toBe(true);
    expect(preferredFieldsForDepth(2).has("transit")).toBe(false);
    expect(preferredFieldsForDepth(8).has("transit")).toBe(true);
  });

  it("招4: early turns prefer condition fields in reminders", () => {
    const record = createEmptyPropertyRecord({ mode: "collecting" });
    const early = getNextQuestions({
      record,
      evidence: [],
      skippedFields: [],
      userTurnCount: 1,
    });
    const earlyIds = early.flatMap((q) => q.fieldIds ?? [q.fieldId]);
    expect(
      earlyIds.some((id) =>
        ["electrical", "water_damage", "amenities", "layout", "floor"].includes(
          id,
        ),
      ),
    ).toBe(true);
  });

  it("resolvePendingConfirm yes/no helpers", () => {
    expect(isYesUtterance("對")).toBe(true);
    const yes = resolvePendingConfirm({
      text: "對",
      pending: {
        fieldId: "odor",
        candidateValue: "無異味",
        source: "assistant_guess",
      },
      messageId: "m",
    });
    expect(yes.facts[0]?.value).toBe("無異味");
    expect(clarifyQuestionForField("water_damage")).toMatch(/漏水|翻新/);
  });
});
