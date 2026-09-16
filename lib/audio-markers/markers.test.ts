import { describe, expect, it } from "vitest";
import {
  attachMediaToMarkers,
  canAddMarkerNow,
  clampSeekTime,
  createAudioMarker,
  formatMarkerTime,
  removeAudioMarker,
  serializeMarkersForAi,
  sortMarkers,
  updateAudioMarker,
} from "./markers";
import { AUDIO_MARKER_TAG_IDS } from "./types";

describe("audio markers", () => {
  it("includes required default tags", () => {
    expect(AUDIO_MARKER_TAG_IDS).toEqual(
      expect.arrayContaining(["price", "noise", "leak", "like", "worry", "follow_up", "other"]),
    );
  });

  it("formats and clamps seek times", () => {
    expect(formatMarkerTime(65)).toBe("01:05");
    expect(clampSeekTime(99, 40)).toBe(40);
    expect(clampSeekTime(-3, 40)).toBe(0);
  });

  it("creates markers with session + optional note", () => {
    const marker = createAudioMarker({
      timeSec: 12.4,
      tagId: "leak",
      note: " 天花水痕 ",
      viewingSessionId: "sess-1",
    });
    expect(marker.timeSec).toBe(12.4);
    expect(marker.tagId).toBe("leak");
    expect(marker.note).toBe("天花水痕");
    expect(marker.viewingSessionId).toBe("sess-1");
  });

  it("updates, removes, sorts, and serializes for AI", () => {
    let markers = [
      createAudioMarker({ timeSec: 20, tagId: "price", id: "a", viewingSessionId: "s" }),
      createAudioMarker({ timeSec: 5, tagId: "noise", id: "b", viewingSessionId: "s" }),
    ];
    markers = updateAudioMarker(markers, "a", { note: "偏貴", tagId: "worry" });
    markers = removeAudioMarker(markers, "b");
    markers = attachMediaToMarkers(markers, "media-1", "s");
    const sorted = sortMarkers([
      ...markers,
      createAudioMarker({ timeSec: 1, tagId: "like", id: "c", viewingSessionId: "s" }),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(["c", "a"]);
    expect(serializeMarkersForAi(sorted)).toEqual([
      { t: 1, tag: "like", note: "" },
      { t: 20, tag: "worry", note: "偏貴" },
    ]);
    expect(sorted[1]?.mediaId).toBe("media-1");
  });

  it("applies tap cooldown to reduce mis-taps", () => {
    expect(canAddMarkerNow(1000, 1200, 450)).toBe(false);
    expect(canAddMarkerNow(1000, 1600, 450)).toBe(true);
  });
});

describe("audio player seek helper", () => {
  it("clamps marker seeks within duration for player UX", () => {
    const duration = 33.2;
    expect(clampSeekTime(0, duration)).toBe(0);
    expect(clampSeekTime(10.5, duration)).toBe(10.5);
    expect(clampSeekTime(100, duration)).toBe(33.2);
  });
});
