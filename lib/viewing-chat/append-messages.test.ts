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

  it("replaces an existing message and keeps a path the later copy still has", () => {
    const merged = appendChatMessages(
      [{ id: "m1", text: "first", media: [{ id: "a", path: null }] }],
      [{ id: "m1", text: "edited", media: [{ id: "a", path: "user/view/photos/a.jpg" }] }],
    );
    expect(merged).toEqual([
      { id: "m1", text: "edited", media: [{ id: "a", path: "user/view/photos/a.jpg" }] },
    ]);
  });

  it("keeps a stored path when a later copy of the same attachment omits it", () => {
    const merged = appendChatMessages(
      [{ id: "m1", media: [{ id: "a", path: "user/view/photos/a.jpg" }] }],
      [{ id: "m1", text: "note", media: [{ id: "a", path: null }] }],
    );
    expect(merged[0]).toMatchObject({
      text: "note",
      media: [{ id: "a", path: "user/view/photos/a.jpg" }],
    });
  });
});
