import { describe, expect, it } from "vitest";
import {
  briefingMatchesAddress,
  emptyBriefing,
  isViewingBriefing,
  notesFingerprint,
  userNotesOnly,
} from "./briefing";
import { createAiMessage, createUserMessage } from "./types";

describe("viewing briefing helpers", () => {
  it("rejects the old smell/look/ask shape", () => {
    expect(
      isViewingBriefing({
        address: "A Street",
        smell: ["x"],
        look: ["y"],
        ask: ["z"],
        generatedAt: new Date().toISOString(),
      }),
    ).toBe(false);
  });

  it("treats briefing as stale when the address changes", () => {
    const briefing = emptyBriefing("A Street");
    expect(briefingMatchesAddress(briefing, "A Street")).toBe(true);
    expect(briefingMatchesAddress(briefing, "B Street")).toBe(false);
  });

  it("fingerprints only user notes and ignores AI bubbles", () => {
    const quiet = createUserMessage({ type: "text", text: "不吵" });
    const ai = createAiMessage({ type: "follow_up", text: "收到" });
    const a = notesFingerprint([quiet, ai]);
    const b = notesFingerprint([quiet]);
    expect(a).toBe(b);
    const louder = createUserMessage({ type: "text", text: "吵" });
    expect(notesFingerprint([louder])).not.toBe(a);
    expect(userNotesOnly([quiet, ai])).toEqual([quiet]);
  });
});
