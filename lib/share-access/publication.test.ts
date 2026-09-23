import { describe, expect, it } from "vitest";
import { buildSharePublication } from "./publication";

const viewing = {
  id: "view",
  user_id: "owner",
  address: "Mutable address",
  pros: ["legacy pro"],
  risks: ["legacy risk"],
  photo_urls: ["owner/view/photos/photo-1.jpg"],
  updated_at: "2026-09-15T12:00:00.000Z",
  property: {
    decisionSummary: {
      version: 1 as const,
      address: "Published address",
      viewingAt: "",
      unitLabel: "8A",
      priceLabel: "$1",
      layoutLabel: "2B",
      listingUrl: "",
      setupNotes: "",
      overallRating: 4,
      pros: [{ id: "p1", text: "Selected", selected: true }],
      risks: [{ id: "r1", text: "Hidden", selected: false }],
      facts: [],
      followUps: [],
      actionItems: [],
      photos: [
        {
          id: "photo-1",
          url: "blob:local-preview",
          remotePath: "owner/view/photos/photo-1.jpg",
          tag: "客廳",
          note: "",
          selected: true,
        },
      ],
      disclaimer: "Disclaimer",
      generatedAt: "2026-09-15T12:00:00.000Z",
    },
  },
};

describe("share publication snapshot", () => {
  it("freezes only selected allowlisted fields and stable media paths", () => {
    const result = buildSharePublication(viewing, "2026-09-15T13:00:00.000Z");
    expect(result.snapshot.address).toBe("Published address");
    expect(result.snapshot.decisionSummary?.pros).toHaveLength(1);
    expect(result.snapshot.decisionSummary?.risks).toEqual([]);
    expect(result.snapshot.decisionSummary?.photos[0]?.url).toBe("");
    expect(result.mediaManifest).toEqual([
      { id: "photo-1", path: "owner/view/photos/photo-1.jpg" },
    ]);
    expect(JSON.stringify(result.snapshot)).not.toContain("blob:");
    expect(JSON.stringify(result.snapshot)).not.toContain("remotePath");
  });

  it("refuses selected media that has not completed upload", () => {
    const localOnly = structuredClone(viewing);
    localOnly.property.decisionSummary.photos[0].remotePath = null as unknown as string;
    expect(() => buildSharePublication(localOnly)).toThrow("SHARE_MEDIA_NOT_READY");
  });

  it("refuses cross-owner, cross-viewing, and unassociated object paths", () => {
    for (const path of [
      "other/view/photos/photo-1.jpg",
      "owner/other-view/photos/photo-1.jpg",
      "owner/view/photos/not-associated.jpg",
    ]) {
      const forged = structuredClone(viewing);
      forged.property.decisionSummary.photos[0].remotePath = path;
      expect(() => buildSharePublication(forged)).toThrow("SHARE_MEDIA_NOT_READY");
    }
  });
});
