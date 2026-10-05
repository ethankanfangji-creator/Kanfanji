import { describe, expect, it } from "vitest";
import { toViewingListItem, viewingListCover } from "./list-item";

describe("toViewingListItem", () => {
  it("extracts decisionStatus, hasReport, and sitePin coords", () => {
    const item = toViewingListItem({
      id: "v1",
      address: "1200 Westwood St",
      updated_at: "2026-10-01T00:00:00.000Z",
      created_at: "2026-09-01T00:00:00.000Z",
      photo_urls: ["https://example.com/a.jpg"],
      video_urls: [],
      report: { sections: [] },
      chat_state: {
        v: 1,
        decisionStatus: "shortlist",
        sitePin: { lat: 49.2815, lng: -122.8512, source: "map" },
      },
    });
    expect(item).toMatchObject({
      id: "v1",
      decisionStatus: "shortlist",
      hasReport: true,
      photo_urls: ["https://example.com/a.jpg"],
      lat: 49.2815,
      lng: -122.8512,
    });
  });

  it("treats reportNotesFingerprint as hasReport", () => {
    const item = toViewingListItem({
      id: "v2",
      address: "1 Main",
      updated_at: "2026-10-01T00:00:00.000Z",
      created_at: "2026-09-01T00:00:00.000Z",
      photo_urls: [],
      video_urls: [],
      chat_state: { reportNotesFingerprint: "abc" },
    });
    expect(item?.hasReport).toBe(true);
    expect(item?.decisionStatus).toBeNull();
  });

  it("returns null without id/address", () => {
    expect(toViewingListItem({ address: "x" })).toBeNull();
  });
});

describe("viewingListCover", () => {
  it("prefers confirmed pin map over storage photo paths", () => {
    expect(
      viewingListCover({
        lat: 49.2815,
        lng: -122.8512,
        photo_urls: ["user/v1/photos/a.jpg"],
      }),
    ).toEqual({ kind: "map", lat: 49.2815, lng: -122.8512 });
  });

  it("ignores non-http photo paths when no coords", () => {
    expect(
      viewingListCover({
        lat: null,
        lng: null,
        photo_urls: ["user/v1/photos/a.jpg"],
      }),
    ).toEqual({ kind: "empty" });
  });

  it("uses http photo when no coords", () => {
    expect(
      viewingListCover({
        lat: null,
        lng: null,
        photo_urls: ["https://cdn.example.com/a.jpg"],
      }),
    ).toEqual({ kind: "photo", url: "https://cdn.example.com/a.jpg" });
  });
});
