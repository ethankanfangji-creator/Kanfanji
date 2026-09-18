import { describe, expect, it } from "vitest";
import type { DecisionSummarySnapshot } from "@/lib/share-card";
import { buildCardImageModel, cardImageFileName } from "./project";

const snapshot: DecisionSummarySnapshot = {
  version: 1,
  address: '12/34 "Test" Street',
  viewingAt: "2026-09-15T18:30:00.000Z",
  unitLabel: "12A",
  priceLabel: "$900,000",
  layoutLabel: "2 bed",
  areaLabel: "850 sqft",
  managementFeeLabel: "$500/mo",
  listingUrl: "https://example.com/listing",
  setupNotes: "Owner-approved setup note",
  overallRating: 4,
  pros: [
    { id: "p1", text: "Selected pro", selected: true },
    { id: "p2", text: "Private pro", selected: false },
  ],
  risks: [{ id: "r1", text: "Selected risk", selected: true }],
  facts: [{ id: "f1", text: "Selected fact", selected: true }],
  followUps: [{ id: "q1", text: "Selected question", selected: true }],
  actionItems: [{ id: "a1", text: "Private action", selected: false }],
  photos: [
    {
      id: "photo-1",
      url: "blob:selected",
      tag: "Kitchen",
      note: "Selected annotation",
      selected: true,
    },
    {
      id: "photo-2",
      url: "blob:private",
      tag: "Bedroom",
      note: "Private annotation",
      selected: false,
    },
  ],
  disclaimer: "AI disclaimer",
  generatedAt: "2026-09-15T19:00:00.000Z",
};

describe("card image projection", () => {
  it("keeps only explicitly selected share-card content", () => {
    const result = buildCardImageModel(snapshot, [
      {
        id: "photo-1",
        tag: "Kitchen",
        note: "Selected annotation",
        dataUrl: "data:image/jpeg;base64,AA==",
        width: 100,
        height: 80,
      },
      {
        id: "photo-2",
        tag: "Bedroom",
        note: "Private annotation",
        dataUrl: "data:image/jpeg;base64,AA==",
        width: 100,
        height: 80,
      },
    ]);

    expect(result.snapshot.pros.map((item) => item.text)).toEqual(["Selected pro"]);
    expect(result.snapshot.actionItems).toEqual([]);
    expect(result.snapshot.photos.map((photo) => photo.id)).toEqual(["photo-1"]);
    expect(result.photos.map((photo) => photo.id)).toEqual(["photo-1"]);
    expect(result.photos[0].note).toBe("Selected annotation");
    expect(JSON.stringify(result)).not.toContain("Private");
  });

  it("creates a filesystem-safe JPEG filename", () => {
    expect(cardImageFileName(snapshot)).toBe("12 34 Test Street-2026-09-15.jpg");
  });
});
