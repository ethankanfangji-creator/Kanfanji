import { describe, expect, it } from "vitest";
import { toggleChatReaction } from "@/lib/viewing-chat/chat-reactions";
import {
  hydrateThreadMessages,
  localNotesAreAuthoritative,
  mergeChatMessages,
  resolveThreadMessages,
} from "@/lib/viewing-chat/merge-messages";
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

describe("resolveThreadMessages", () => {
  const extra: ChatMessage = {
    id: "m2",
    role: "user",
    type: "text",
    timestamp: "2026-10-04T00:01:00.000Z",
    text: "價格談過",
  };

  it("lets the owner replace text and drop deleted notes", () => {
    const edited = { ...base, text: "採光其實不好" };
    const resolved = resolveThreadMessages({
      isOwner: true,
      existing: [base, extra],
      incoming: [edited],
    });
    expect(resolved).toEqual([edited]);
  });

  it("keeps collaborator writes append-only so they cannot wipe owner notes", () => {
    const resolved = resolveThreadMessages({
      isOwner: false,
      existing: [base, extra],
      incoming: [{ ...base, text: "should not overwrite" }],
    });
    expect(resolved.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(resolved[0]?.text).toBe("採光不錯");
  });
});

describe("hydrateThreadMessages", () => {
  const remote: ChatMessage = {
    id: "m2",
    role: "user",
    type: "text",
    timestamp: "2026-10-04T00:01:00.000Z",
    text: "雲端還留著已刪的筆記",
  };

  it("does not resurrect a locally deleted note after a failed or pending sync", () => {
    expect(
      hydrateThreadMessages({
        localMessages: [base],
        remoteMessages: [base, remote],
        localUpdatedAt: "2026-10-04T12:00:00.000Z",
        remoteUpdatedAt: "2026-10-04T11:00:00.000Z",
        localCloudState: "syncing",
      }).map((message) => message.id),
    ).toEqual(["m1"]);
  });

  it("treats a newer local snapshot as authoritative so refresh can still flush it", () => {
    expect(
      localNotesAreAuthoritative({
        hasLocalMessages: true,
        localUpdatedAt: "2026-10-04T12:00:00.000Z",
        remoteUpdatedAt: "2026-10-04T11:00:00.000Z",
        localCloudState: "synced",
        localRevision: 4,
        remoteRevision: 4,
      }),
    ).toBe(true);
  });

  it("does not treat a newer local clock as authoritative when the cloud revision is ahead", () => {
    expect(
      localNotesAreAuthoritative({
        hasLocalMessages: true,
        localUpdatedAt: "2026-10-10T12:00:00.000Z",
        remoteUpdatedAt: "2026-10-10T11:00:00.000Z",
        localCloudState: "synced",
        localRevision: 2,
        remoteRevision: 3,
      }),
    ).toBe(false);
  });

  it("still pulls newer remote notes when local is already synced and older", () => {
    expect(
      hydrateThreadMessages({
        localMessages: [base],
        remoteMessages: [base, remote],
        localUpdatedAt: "2026-10-04T11:00:00.000Z",
        remoteUpdatedAt: "2026-10-04T12:00:00.000Z",
        localCloudState: "synced",
      }).map((message) => message.id),
    ).toEqual(["m1", "m2"]);
  });
});
