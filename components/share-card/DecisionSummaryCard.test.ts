import { describe, expect, it } from "vitest";
import { buildDecisionSummary, decisionSummaryStructure } from "@/lib/share-card";
import { DECISION_SUMMARY_CARD_SECTIONS } from "@/components/share-card/DecisionSummaryCard";

describe("DecisionSummaryCard structure", () => {
  it("keeps a stable section order for the decision summary card", () => {
    expect([...DECISION_SUMMARY_CARD_SECTIONS]).toEqual([
      "header",
      "basics",
      "rating",
      "pros",
      "risks",
      "photos",
      "facts",
      "followUps",
      "actionItems",
      "disclaimer",
    ]);
  });

  it("snapshot of public card shape stays empty-safe", () => {
    const snapshot = buildDecisionSummary({
      address: "88 Main St",
      viewingAt: "2026-09-15T10:00:00.000Z",
      layoutLabel: "2B1B",
      priceLabel: "$800k",
      overallRating: 3,
      pros: ["Light"],
      risks: [],
      facts: [],
      followUps: ["HOA?"],
      actionItems: [],
      photos: [],
      disclaimer: "AI disclaimer",
      generatedAt: "2026-09-15T12:00:00.000Z",
    });

    expect(decisionSummaryStructure(snapshot)).toMatchInlineSnapshot(`
      {
        "actionItemsCount": 0,
        "factsCount": 0,
        "followUpsCount": 1,
        "hasAddress": true,
        "hasBasics": true,
        "hasDisclaimer": true,
        "hasViewingAt": true,
        "photosCount": 0,
        "prosCount": 1,
        "rating": 3,
        "risksCount": 0,
        "selectedPhotos": 0,
        "selectedPros": 1,
        "selectedRisks": 0,
        "version": 1,
      }
    `);
  });
});
