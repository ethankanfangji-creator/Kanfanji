import { describe, expect, it } from "vitest";
import { appendChatMessages } from "./append-messages";

describe("appendChatMessages", () => {
  it("keeps older messages when the client only sends the tail", () => {
    const existing = Array.from({ length: 120 }, (_, index) => ({ id: `m${index}` }));
    const incoming = [
      ...existing.slice(-80),
      { id: "new-user" },
      { id: "new-ai" },
    ];
    const merged = appendChatMessages(existing, incoming);
    expect(merged).toHaveLength(122);
    expect(merged[0]?.id).toBe("m0");
    expect(merged.at(-1)?.id).toBe("new-ai");
  });
});
