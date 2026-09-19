import { describe, expect, it } from "vitest";
import type { MediaItem, ViewingSession } from "@/lib/draft-db";
import { auditViewingSessionBridge } from "./bridge-audit";

const session = {
  id: "session-1",
  address: "123 Main",
} as ViewingSession;

describe("auditViewingSessionBridge", () => {
  it("accepts an exact shadow-read match regardless of media ordering", () => {
    const result = auditViewingSessionBridge({
      expectedSessionId: "session-1",
      expectedAddress: "123 Main",
      expectedMediaIds: ["photo-1", "audio-1"],
      session,
      media: [{ id: "audio-1" }, { id: "photo-1" }] as MediaItem[],
    });

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("reports divergence without changing either store", () => {
    const result = auditViewingSessionBridge({
      expectedSessionId: "session-1",
      expectedAddress: "123 Main",
      expectedMediaIds: ["photo-1", "audio-1"],
      session: { ...session, address: "Different" },
      media: [{ id: "photo-1" }] as MediaItem[],
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      "address_mismatch",
      "media_count_mismatch",
      "media_id_mismatch",
    ]);
  });

  it("fails closed when the canonical session is missing", () => {
    expect(
      auditViewingSessionBridge({
        expectedSessionId: "session-1",
        expectedAddress: "123 Main",
        expectedMediaIds: [],
        session: null,
        media: [],
      }),
    ).toEqual({ ok: false, issues: ["session_missing"] });
  });
});
