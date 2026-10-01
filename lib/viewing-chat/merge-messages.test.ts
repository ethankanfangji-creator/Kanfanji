import { describe, expect, it } from "vitest";
import { toggleChatReaction } from "@/lib/viewing-chat/chat-reactions";
import { mergeChatMessages } from "@/lib/viewing-chat/merge-messages";
import type { ChatMessage } from "@/lib/viewing-chat/types";

const base: ChatMessage = {
  id: "m1",
  role: "user",
  type: "text",
  timestamp: "2026-09-30T00:00:00.000Z",
  text: "採光不錯",
};

describe("chat reactions", () => {
  it("keeps an emoji on the same message and adds a reply underneath its id", () => {
    const reacted = { ...base, reactions: toggleChatReaction(undefined, "👍", "user-1") };
    const reply: ChatMessage = {
      id: "m2",
      role: "user",
      type: "text",
      timestamp: "2026-09-30T00:01:00.000Z",
      text: "我也覺得",
      replyTo: { messageId: "m1", role: "user", preview: "採光不錯" },
    };
    const merged = mergeChatMessages([base], [reacted, reply]);
    expect(merged.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(merged[0]?.reactions).toEqual([{ emoji: "👍", userId: "user-1" }]);
    expect(merged[1]?.replyTo?.messageId).toBe("m1");
  });
});
