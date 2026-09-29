import { describe, expect, it } from "vitest";
import { applyChatStateToLocal, mergeChatState, roundTripChatState } from "./chat-state";
import { buildChatStatePayload } from "./cloud-push";
import type { ViewingChatThread } from "./types";

const thread = {
  id: "t1",
  address: "1 Main",
  normalizedAddress: "1 Main St",
  createdAt: "2026-09-28T00:00:00.000Z",
  updatedAt: "2026-09-28T00:00:00.000Z",
  messages: [],
  report: null,
  metadata: null,
  propertyRecord: { fields: { price: { value: "1500" }, floor: { value: "5" } } },
  propertyEvidence: [],
  agendaActiveId: "price",
  agendaSkippedIds: [],
  collectionSkippedFields: [],
  collectionFocusFieldIds: [],
  conversationStatus: "collecting",
  pendingConfirm: null,
  pinned: false,
} as unknown as ViewingChatThread;

describe("chat state round trip", () => {
  it("build then apply then build stays the same", () => {
    expect(roundTripChatState(thread)).toEqual(buildChatStatePayload(thread));
  });

  it("keeps cloud price and floor when a second device only toggles pin", () => {
    const cloud = buildChatStatePayload(thread);
    const bare = { ...thread, propertyRecord: null, pinned: false, normalizedAddress: null };
    const loaded = applyChatStateToLocal(bare, cloud);
    const pinned = { ...loaded, pinned: true };
    const merged = mergeChatState(cloud, buildChatStatePayload(pinned));
    const fields = (merged.propertyRecord as { fields: Record<string, { value: string }> }).fields;
    expect(fields.price.value).toBe("1500");
    expect(fields.floor.value).toBe("5");
    expect(merged.pinned).toBe(true);
  });

  it("keeps existing fields when a turn sends a null property record", () => {
    const merged = mergeChatState(buildChatStatePayload(thread), { v: 1, propertyRecord: null });
    const fields = (merged.propertyRecord as { fields: Record<string, { value: string }> }).fields;
    expect(fields.price.value).toBe("1500");
    expect(fields.floor.value).toBe("5");
  });
});
