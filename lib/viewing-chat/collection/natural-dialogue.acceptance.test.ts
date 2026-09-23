/**
 * Acceptance: natural-dialogue viewing chat is complete only when all scenarios pass.
 */
import { describe, expect, it } from "vitest";
import { createConversationState, processUserTurn } from "./process-user-turn";
import { extractPropertyFacts } from "./extract-property-facts";
import { composeAssistantMessage } from "./compose-assistant-message";

describe("natural dialogue acceptance", () => {
  it("1) out-of-order answer still files correctly", async () => {
    const conversation = createConversationState({
      address: "台北市",
      locale: "zh-Hant",
    });
    // User answers noise first (not address/price agenda order)
    const result = await processUserTurn({
      conversation,
      message: { id: "o1", text: "陽台外高架很吵，採光倒不錯" },
    });
    expect(result.updatedRecord.fields.noise?.rawText).toMatch(/高架|吵/);
    expect(result.updatedRecord.fields.light?.rawText).toMatch(/採光/);
    expect(result.assistantMessage).not.toMatch(/請先回答|應該先|下一題/);
  });

  it("2) one message with five fact types extracts all", async () => {
    const result = await processUserTurn({
      conversation: createConversationState({ address: "台北" }),
      message: {
        id: "m5",
        text:
          "格局 3房2廳，開價 1280 萬，大概 28 坪。優點採光好，缺點屋齡偏老，陽台外很吵。",
      },
    });
    expect(result.updatedRecord.fields.layout?.value).toMatch(/3房2廳/);
    expect(result.updatedRecord.fields.price?.value).toBe(12_800_000);
    expect(result.updatedRecord.fields.area?.status).toBe("inferred"); // 大概
    expect(result.updatedRecord.fields.pros).toBeDefined();
    expect(result.updatedRecord.fields.cons).toBeDefined();
    expect(result.updatedRecord.fields.noise).toBeDefined();
    expect(result.changes.length).toBeGreaterThanOrEqual(5);
  });

  it("3) mid-topic switch keeps prior + new info", async () => {
    let state = createConversationState({ address: "台北" });
    const first = await processUserTurn({
      conversation: state,
      message: { id: "t1", text: "格局 2房1廳" },
    });
    state = {
      ...state,
      record: first.updatedRecord,
      evidence: first.updatedEvidence,
      status: first.conversationStatus,
    };
    const second = await processUserTurn({
      conversation: state,
      message: { id: "t2", text: "對了，進門有點霉味" },
    });
    expect(second.updatedRecord.fields.layout?.value).toMatch(/2房1廳/);
    expect(second.updatedRecord.fields.odor?.rawText || second.changes.some((c) => c.fieldId === "odor")).toBeTruthy();
  });

  it("4) bare 不知道 does not stall", async () => {
    const result = await processUserTurn({
      conversation: createConversationState({ address: "台北" }),
      message: { id: "dk", text: "不知道" },
    });
    expect(result.intent).toBe("skip");
    expect(result.conversationStatus).toBe("collecting");
    expect(result.assistantMessage).toMatch(/跳過|留空|沒問題|卡住|不知道/);
    // Still offers other reminders or a soft continue — never demands the same slot
    expect(result.assistantMessage).not.toMatch(/必須|一定要填/);
  });

  it("5) correction replaces old value; summary change shows new", async () => {
    let state = createConversationState({ address: "台北" });
    const first = await processUserTurn({
      conversation: state,
      message: { id: "c1", text: "開價 1280 萬" },
    });
    state = {
      ...state,
      record: first.updatedRecord,
      evidence: first.updatedEvidence,
      status: first.conversationStatus,
    };
    const corrected = await processUserTurn({
      conversation: state,
      message: { id: "c2", text: "不是 1280，是 1250 萬" },
    });
    expect(corrected.updatedRecord.fields.price?.value).toBe(12_500_000);
    expect(corrected.updatedRecord.fields.price?.status).toBe("corrected");
    expect(corrected.changes.some((c) => c.kind === "corrected")).toBe(true);
    expect(corrected.assistantMessage).toMatch(/1250|更正|改/);
    expect(corrected.assistantMessage).not.toMatch(/有效值.*1280|仍是\s*1280/);
  });

  it("6) fuzzy wording is not turned into fake precise numbers", () => {
    const vague = extractPropertyFacts({
      text: "離捷運不遠，大概三十多坪左右吧",
      messageId: "f1",
    });
    const transit = vague.fields.find((f) => f.fieldId === "transit");
    expect(transit?.value).toMatch(/離捷運不遠/);
    expect(String(transit?.value)).not.toMatch(/\d+\s*分鐘/);

    const approx = extractPropertyFacts({
      text: "大概 30 坪",
      messageId: "f2",
    });
    const area = approx.fields.find((f) => f.fieldId === "area");
    expect(area?.status).toBe("inferred");
    expect(area?.rawText).toMatch(/大概|30/);
  });

  it("7) subjective-only finish → reviewing without requiring full form", async () => {
    let state = createConversationState({ address: "台北" });
    const feel = await processUserTurn({
      conversation: state,
      message: { id: "s1", text: "整體感覺採光不錯，但有點吵" },
    });
    state = {
      ...state,
      record: feel.updatedRecord,
      evidence: feel.updatedEvidence,
      status: feel.conversationStatus,
    };
    const done = await processUserTurn({
      conversation: state,
      message: { id: "s2", text: "先這樣，整理一下" },
    });
    expect(done.conversationStatus).toBe("reviewing");
    expect(done.updatedRecord.fields.price).toBeUndefined();
    expect(done.assistantMessage).toMatch(/摘要|整理|完成不代表|留空/);
  });

  it("8) AI / JSON failure keeps raw input and filed facts", async () => {
    const result = await processUserTurn({
      conversation: createConversationState({ address: "台北" }),
      message: { id: "fail", text: "開價 1500 萬，格局 3房" },
      polishReply: async (draft) => ({
        text: draft,
        warning: "extraction_failed",
        extractionStatus: "extraction_failed",
        rawAiResponse: "{not-json",
      }),
    });
    expect(result.preservedMessageId).toBe("fail");
    expect(result.extractionStatus).toBe("extraction_failed");
    expect(result.rawAiResponse).toBe("{not-json");
    expect(result.updatedRecord.fields.price?.value).toBe(15_000_000);
    expect(result.updatedRecord.fields.layout?.value).toMatch(/3房/);
  });

  it("9) reply framing is acknowledge+reminder, not next-question agenda; filed values stay out of prose", () => {
    const text = composeAssistantMessage({
      intent: "supplement",
      sourceText: "開價 1280 萬",
      changes: [
        {
          fieldId: "price",
          kind: "added",
          nextValue: 12_800_000,
          rawText: "1280 萬",
        },
      ],
      questions: [
        {
          fieldId: "area",
          question: "大約幾坪？",
          priority: 90,
          skippable: true,
        },
      ],
      status: "collecting",
      warnings: [],
    });
    // Understand line + reminders; no duplicate「已歸檔」checklist (chips own that)
    expect(text).toMatch(/聽懂|收下|對上|Understood|Logged|taken in/i);
    expect(text).not.toMatch(/這一輪新收到、已歸檔|剛記入的變更|What changed this turn|Here's what we just filed/);
    expect(text).not.toMatch(/•\s*價格：/);
    expect(text).toMatch(/值得提醒|值得補|留意|clarify|remind/i);
    expect(text).not.toMatch(/下一題是|請依序回答|問卷第/);
  });
});
