import { describe, expect, it } from "vitest";
import { createConversationState, processUserTurn } from "./process-user-turn";

describe("processUserTurn", () => {
  it("runs the full pipeline on a rich supplement message", async () => {
    const conversation = createConversationState({
      address: "台北市大安區",
      locale: "zh-Hant",
    });

    const result = await processUserTurn({
      conversation,
      message: {
        id: "msg_1",
        text:
          "格局 3房2廳，開價 1280 萬。優點採光不錯，缺點屋齡偏老。" +
          "對了陽台外有高架很吵。",
      },
    });

    expect(result.intent).toBe("supplement");
    expect(result.conversationStatus).toBe("collecting");
    expect(result.extractionStatus).toBe("ok");
    expect(result.updatedRecord.fields.price?.value).toBe(12_800_000);
    expect(result.updatedRecord.fields.layout?.value).toMatch(/3房2廳/);
    expect(result.updatedRecord.fields.noise?.rawText).toMatch(/高架|吵/);
    expect(result.suggestedQuestions.length).toBeLessThanOrEqual(3);
    expect(result.changes.some((c) => c.fieldId === "price")).toBe(true);
    expect(result.assistantMessage).toMatch(/聽懂|收下|對上|記/);
    expect(result.assistantMessage).toMatch(/跳過|選答|確認/);
    expect(result.preservedMessageId).toBe("msg_1");
  });

  it("handles skip of area and finish intents", async () => {
    const conversation = createConversationState({ address: "台北" });

    const skipped = await processUserTurn({
      conversation,
      message: { id: "s1", text: "坪數我不知道，之後再補" },
    });
    expect(skipped.intent).toBe("skip");
    expect(skipped.updatedRecord.skippedFields).toContain("area");
    expect(skipped.changes.some((c) => c.kind === "skipped" || c.kind === "unknown")).toBe(
      true,
    );

    const finished = await processUserTurn({
      conversation: {
        ...conversation,
        record: skipped.updatedRecord,
        evidence: skipped.updatedEvidence,
        status: skipped.conversationStatus,
      },
      message: { id: "s2", text: "整理一下" },
    });
    expect(finished.intent).toBe("finish");
    expect(finished.conversationStatus).toBe("reviewing");
    expect(finished.suggestedQuestions).toEqual([]);
    expect(finished.assistantMessage).toMatch(/摘要|整理|報告|留空/);
  });

  it("applies corrections and records changes", async () => {
    let conversation = createConversationState({ address: "台北" });
    const first = await processUserTurn({
      conversation,
      message: { id: "c1", text: "開價 1280 萬" },
    });
    conversation = {
      ...conversation,
      record: first.updatedRecord,
      evidence: first.updatedEvidence,
      status: first.conversationStatus,
    };

    const corrected = await processUserTurn({
      conversation,
      message: { id: "c2", text: "不是 1280，是 1250 萬" },
    });
    expect(corrected.intent).toBe("correct");
    expect(corrected.updatedRecord.fields.price?.value).toBe(12_500_000);
    expect(corrected.changes.some((c) => c.kind === "corrected")).toBe(true);
    expect(corrected.assistantMessage).toMatch(/更正|改|為準|1250/);
  });

  it("guards empty messages without dropping conversation state", async () => {
    const conversation = createConversationState({ address: "台北" });
    const result = await processUserTurn({
      conversation,
      message: { id: "empty", text: "   " },
    });
    expect(result.warnings).toContain("empty_message");
    expect(result.preservedMessageId).toBe("empty");
    expect(result.updatedRecord.address).toBe("台北");
    expect(result.assistantMessage.length).toBeGreaterThan(0);
  });

  it("guards photo without vision extraction", async () => {
    const conversation = createConversationState({ address: "台北" });
    const result = await processUserTurn({
      conversation,
      message: { id: "photo1", text: "" },
      captures: [{ kind: "photo", messageId: "photo1" }],
    });
    expect(result.intent).toBe("upload_related");
    expect(result.warnings).toContain("pending_vision");
    expect(result.updatedRecord.captures.some((c) => c.pendingVision)).toBe(true);
    expect(result.updatedRecord.fields.price).toBeUndefined();
    expect(result.assistantMessage).toMatch(/圖片|影像|photo|image/i);
  });

  it("guards incomplete transcript", async () => {
    const conversation = createConversationState({ address: "台北" });
    const result = await processUserTurn({
      conversation,
      message: {
        id: "voice1",
        transcript: "嗯",
        transcriptIncomplete: true,
      },
    });
    expect(result.warnings).toContain("incomplete_transcript");
    expect(result.updatedRecord.captures.length).toBeGreaterThan(0);
    expect(result.assistantMessage).toMatch(/轉錄|不完整|restat|type/i);
  });

  it("keeps facts when LLM polish fails", async () => {
    const conversation = createConversationState({ address: "台北" });

    const result = await processUserTurn({
      conversation,
      message: {
        id: "net1",
        text: "兩房一廳，開價 980 萬，離捷運不遠",
      },
      polishReply: async () => {
        throw new Error("network down");
      },
    });

    expect(result.warnings).toContain("polish_failed");
    expect(result.extractionStatus).toBe("ok");
    expect(result.updatedRecord.fields.price?.value).toBe(9_800_000);
    expect(result.updatedRecord.fields.transit?.rawText).toMatch(/離捷運不遠/);
    expect(result.assistantMessage.length).toBeGreaterThan(0);
    expect(result.preservedMessageId).toBe("net1");
  });

  it("maps bus-walk minutes to transit not amenities", async () => {
    const conversation = createConversationState({
      address: "Saint-Clar",
    });
    conversation.focusFieldIds = ["amenities"];
    const result = await processUserTurn({
      conversation,
      message: { id: "bus1", text: "公車站走路五分鐘" },
    });
    expect(result.updatedRecord.fields.transit?.value).toMatch(/公車站|五分鐘|走路/);
    expect(result.updatedRecord.fields.amenities?.value).toBeFalsy();
    expect(result.changes.some((c) => c.fieldId === "transit")).toBe(true);
  });

  it("falls back when LLM returns invalid schema", async () => {
    const conversation = createConversationState({ address: "台北" });

    const result = await processUserTurn({
      conversation,
      message: { id: "schema1", text: "格局 2房1廳" },
      polishReply: async (draft) => ({
        text: draft,
        warning: "llm_schema_invalid",
      }),
    });

    expect(result.warnings).toContain("llm_schema_invalid");
    expect(result.updatedRecord.fields.layout?.value).toMatch(/2房1廳/);
    expect(result.assistantMessage).toMatch(/格局|2房|聽懂|收下|對上/);
  });

  it("does not scold out-of-order answers and varies structure", async () => {
    const conversation = createConversationState({ address: "台北" });
    const result = await processUserTurn({
      conversation,
      message: {
        id: "aside",
        text: "我還沒量坪數，不過窗邊車流很吵",
      },
    });
    expect(result.assistantMessage).not.toMatch(/請先回答|沒有依照|應該先/);
    expect(result.updatedRecord.fields.noise).toBeDefined();
    // understand + changes + optional questions pattern
    expect(result.assistantMessage.split("\n\n").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps rule-based facts when polish schema fails", async () => {
    const conversation = createConversationState({ address: "台北" });
    const result = await processUserTurn({
      conversation,
      message: { id: "p1", text: "開價 1500 萬" },
      polishReply: async (draft) => ({
        text: draft,
        warning: "extraction_failed",
        extractionStatus: "extraction_failed",
        rawAiResponse: '{"bad":true}',
      }),
    });
    expect(result.extractionStatus).toBe("extraction_failed");
    expect(result.rawAiResponse).toBe('{"bad":true}');
    expect(result.updatedRecord.fields.price?.value).toBe(15_000_000);
    expect(result.warnings).toContain("extraction_failed");
  });
});
