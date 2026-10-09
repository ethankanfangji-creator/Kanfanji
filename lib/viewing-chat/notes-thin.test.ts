import { describe, expect, it } from "vitest";
import { notesAreThinForReport, notesSubstantialCharCount } from "./notes-thin";
import type { ChatMessage } from "./types";

function note(partial: Partial<ChatMessage> & Pick<ChatMessage, "id">): ChatMessage {
  return {
    role: "user",
    type: "text",
    timestamp: "2026-10-08T00:00:00.000Z",
    ...partial,
  };
}

describe("notesAreThinForReport", () => {
  it("is false when there are no notes (empty gate is separate)", () => {
    expect(notesAreThinForReport([])).toBe(false);
  });

  it("is true for a single note even if long", () => {
    expect(
      notesAreThinForReport([
        note({ id: "1", text: "客廳採光很好，廚房已翻新，樓下有合法套房。" }),
      ]),
    ).toBe(true);
  });

  it("is true for two notes with almost no text", () => {
    expect(
      notesAreThinForReport([
        note({ id: "1", type: "photo", text: "" }),
        note({ id: "2", type: "photo", text: "ok" }),
      ]),
    ).toBe(true);
  });

  it("is false for two notes with enough text", () => {
    expect(
      notesAreThinForReport([
        note({ id: "1", text: "客廳採光很好，地板是原木，窗戶可開沒有漏風或異味。" }),
        note({ id: "2", transcript: "廚房水壓正常，沒有霉味，浴室乾爽，電箱看起來新。" }),
      ]),
    ).toBe(false);
  });
});

describe("notesSubstantialCharCount", () => {
  it("sums trimmed transcript, text, and analysis lengths", () => {
    expect(
      notesSubstantialCharCount([
        note({ id: "1", text: "abc", transcript: "xy", analysis: "de" }),
      ]),
    ).toBe(7);
  });
});
