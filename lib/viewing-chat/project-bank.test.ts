import { describe, expect, it } from "vitest";
import { projectQuestionBank } from "./project-bank";
import type { ChatMessage } from "./types";

describe("projectQuestionBank", () => {
  it("fills answers from AI matched turns and flags justDiscussed", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        type: "audio",
        timestamp: "2026-09-19T00:00:00.000Z",
        transcript: "電箱是 Federal 100A",
      },
      {
        id: "a1",
        role: "ai",
        type: "fill",
        timestamp: "2026-09-19T00:00:01.000Z",
        text: "幫你記到電箱卡了",
        matched: [{ id: "q_panel", answer: "Federal 100A" }],
      },
    ];
    const bank = projectQuestionBank(messages);
    expect(bank).toHaveLength(6);
    const panel = bank.find((item) => item.id === "q_panel");
    expect(panel?.answer).toBe("Federal 100A");
    expect(panel?.justDiscussed).toBe(true);
    expect(bank.filter((item) => item.justDiscussed)).toHaveLength(1);
  });

  it("appends new_card discoveries after the default six", () => {
    const messages: ChatMessage[] = [
      {
        id: "a2",
        role: "ai",
        type: "new_card",
        timestamp: "2026-09-19T00:00:02.000Z",
        category: "衣櫃",
        question: "衣櫃門卡？",
        answer: "關不緊",
        matched: [{ id: "q_closet", answer: "關不緊" }],
      },
    ];
    const bank = projectQuestionBank(messages);
    expect(bank.some((item) => item.question === "衣櫃門卡？")).toBe(true);
    expect(bank.find((item) => item.question === "衣櫃門卡？")?.justDiscussed).toBe(true);
  });
});
