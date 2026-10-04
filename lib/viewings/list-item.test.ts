import { describe, expect, it } from "vitest";
import { toViewingListItem } from "./list-item";

describe("toViewingListItem", () => {
  it("extracts decisionStatus and hasReport from chat_state / report", () => {
    const item = toViewingListItem({
      id: "v1",
      address: "1200 Westwood St",
      updated_at: "2026-10-01T00:00:00.000Z",
      created_at: "2026-09-01T00:00:00.000Z",
      photo_urls: ["https://example.com/a.jpg"],
      video_urls: [],
      report: { sections: [] },
      chat_state: { v: 1, decisionStatus: "shortlist" },
    });
    expect(item).toMatchObject({
      id: "v1",
      decisionStatus: "shortlist",
      hasReport: true,
      photo_urls: ["https://example.com/a.jpg"],
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
