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
  collectionSkippedFields: [],
  conversationStatus: "collecting",
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

  it("keeps a map pin across refresh and does not let a later payload without a pin replace it", () => {
    const withPin = {
      ...thread,
      sitePin: { lat: 49.2815, lng: -122.8512, source: "map" as const },
    };
    const saved = buildChatStatePayload(withPin);
    const reloaded = applyChatStateToLocal(thread, saved);
    expect(reloaded.sitePin).toEqual({ lat: 49.2815, lng: -122.8512, source: "map" });
    const merged = mergeChatState(saved, { v: 1, pinned: true });
    expect(merged.sitePin).toEqual({ lat: 49.2815, lng: -122.8512, source: "map" });
  });

  it("keeps existing fields when a turn sends a null property record", () => {
    const merged = mergeChatState(buildChatStatePayload(thread), { v: 1, propertyRecord: null });
    const fields = (merged.propertyRecord as { fields: Record<string, { value: string }> }).fields;
    expect(fields.price.value).toBe("1500");
    expect(fields.floor.value).toBe("5");
  });

  it("round-trips decisionStatus and clears invalid values", () => {
    const withStatus = { ...thread, decisionStatus: "shortlist" as const };
    const saved = buildChatStatePayload(withStatus);
    expect(saved.decisionStatus).toBe("shortlist");
    const loaded = applyChatStateToLocal(thread, saved);
    expect(loaded.decisionStatus).toBe("shortlist");
    const cleared = mergeChatState(saved, { v: 1, decisionStatus: null });
    expect(cleared.decisionStatus).toBeNull();
    const invalid = mergeChatState(saved, { v: 1, decisionStatus: "damp" });
    expect(invalid.decisionStatus).toBeNull();
  });

  it("round-trips tags and syncs decisionStatus from suggestion tags", () => {
    const withTags = { ...thread, tags: ["太吵", "liked"], decisionStatus: null };
    const saved = buildChatStatePayload(withTags);
    expect(saved.tags).toEqual(["太吵", "liked"]);
    expect(saved.decisionStatus).toBe("liked");
    const loaded = applyChatStateToLocal(thread, saved);
    expect(loaded.tags).toEqual(["太吵", "liked"]);
    expect(loaded.decisionStatus).toBe("liked");
  });

  it("round-trips overallRating and clears invalid values", () => {
    const withRating = { ...thread, overallRating: 4 };
    const saved = buildChatStatePayload(withRating);
    expect(saved.overallRating).toBe(4);
    const loaded = applyChatStateToLocal(thread, saved);
    expect(loaded.overallRating).toBe(4);
    const cleared = mergeChatState(saved, { v: 1, overallRating: null });
    expect(cleared.overallRating).toBeNull();
    const invalid = mergeChatState(saved, { v: 1, overallRating: 9 });
    expect(invalid.overallRating).toBeNull();
  });

  it("round-trips unit identity fields", () => {
    const withUnit = {
      ...thread,
      unitKey: "5",
      unitLabel: "Unit 5",
      placeId: "place-1",
    };
    const saved = buildChatStatePayload(withUnit);
    expect(saved).toMatchObject({
      unitKey: "5",
      unitLabel: "Unit 5",
      placeId: "place-1",
    });
    const loaded = applyChatStateToLocal(thread, saved);
    expect(loaded.unitKey).toBe("5");
    expect(loaded.unitLabel).toBe("Unit 5");
    expect(loaded.placeId).toBe("place-1");
  });
});
