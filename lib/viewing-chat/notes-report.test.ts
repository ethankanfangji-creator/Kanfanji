import { describe, expect, it } from "vitest";
import { notesFingerprint } from "./briefing";
import { createUserMessage } from "./types";

describe("notes-only report inputs", () => {
  it("keeps 不吵 as its own note fingerprint distinct from 吵", () => {
    const quiet = createUserMessage({ type: "text", text: "不吵" });
    const loud = createUserMessage({ type: "text", text: "吵" });
    expect(quiet.text).toBe("不吵");
    expect(notesFingerprint([quiet])).not.toBe(notesFingerprint([loud]));
  });
});
