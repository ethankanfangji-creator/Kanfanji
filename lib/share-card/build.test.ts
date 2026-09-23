import { describe, expect, it } from "vitest";
import {
  buildDecisionSummary,
  decisionSummaryStructure,
  selectedTextItems,
  togglePhotoSelection,
  toggleTextSelection,
  toPublicDecisionSummary,
} from "./build";

describe("buildDecisionSummary", () => {
  it("builds a stable decision-summary structure with empty-safe fields", () => {
    const snapshot = buildDecisionSummary({
      address: "1200 Westwood St",
      viewingAt: "2026-09-15T18:00:00.000Z",
      unitLabel: "1202",
      priceLabel: "899k",
      layoutLabel: "2B2B",
      overallRating: 4,
      pros: ["採光好", "社區安靜", ""],
      risks: ["電箱待換"],
      facts: ["屋頂 2018 換過"],
      followUps: ["管理費含什麼？"],
      actionItems: ["約驗屋"],
      photos: [
        { id: 1, url: "https://example.com/a.jpg", tag: "客廳", note: "朝南" },
        { id: 2, thumbUrl: "https://example.com/b.jpg", tag: "廚房" },
      ],
      disclaimer: "AI 初步判斷，並非專業驗屋結果",
      generatedAt: "2026-09-15T20:00:00.000Z",
    });

    expect(decisionSummaryStructure(snapshot)).toEqual({
      version: 1,
      hasAddress: true,
      hasViewingAt: true,
      hasBasics: true,
      rating: 4,
      prosCount: 2,
      risksCount: 1,
      factsCount: 1,
      followUpsCount: 1,
      actionItemsCount: 1,
      photosCount: 2,
      selectedPros: 2,
      selectedRisks: 1,
      selectedPhotos: 2,
      hasDisclaimer: true,
    });
    expect(snapshot.pros.every((p) => p.text.length > 0)).toBe(true);
  });

  it("supports selection toggles and public projection without undefined holes", () => {
    let snapshot = buildDecisionSummary({
      address: "A",
      disclaimer: "d",
      pros: ["p1", "p2", "p3", "p4"],
      risks: [],
      photos: [{ id: "x", url: "https://x.test/p.jpg", selected: true }],
      defaultSelectedLimit: 3,
    });
    expect(selectedTextItems(snapshot.pros)).toHaveLength(3);
    snapshot = toggleTextSelection(snapshot, "pros", snapshot.pros[3]!.id);
    expect(selectedTextItems(snapshot.pros)).toHaveLength(4);
    snapshot = togglePhotoSelection(snapshot, "x");
    const pub = toPublicDecisionSummary(snapshot);
    expect(pub.photos).toHaveLength(0);
    expect(pub.risks).toEqual([]);
    expect(pub.address).toBe("A");
    expect(Object.values(pub).every((v) => v !== undefined)).toBe(true);
  });

  it("clamps rating and ignores empty address-only media without urls", () => {
    const snapshot = buildDecisionSummary({
      address: "  ",
      overallRating: 9,
      disclaimer: "d",
      photos: [{ id: 1, tag: "x" }],
    });
    expect(snapshot.overallRating).toBe(5);
    expect(snapshot.photos).toHaveLength(0);
    expect(snapshot.address).toBe("");
  });
});
