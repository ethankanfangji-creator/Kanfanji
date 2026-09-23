import { describe, expect, it } from "vitest";
import { buildCardFromViewing } from "./from-viewing";
import type { ViewingAiSummary } from "@/lib/ai-summary";

const sampleSummary: ViewingAiSummary = {
  version: 1,
  transcript: "hello",
  facts: [
    {
      id: "f1",
      text: "Roof 2018",
      confidence: "high",
      sources: [],
    },
  ],
  pros: [
    {
      id: "p1",
      text: "Bright",
      confidence: "medium",
      sources: [],
    },
  ],
  risks: [
    {
      id: "r1",
      text: "Panel",
      confidence: "low",
      sources: [],
      deleted: true,
    },
  ],
  followUps: [],
  actionItems: [
    {
      id: "a1",
      text: "Book inspection",
      confidence: "high",
      sources: [],
    },
  ],
  generatedAt: "2026-09-15T00:00:00.000Z",
};

describe("buildCardFromViewing", () => {
  it("prefers AI claims and skips deleted risks", () => {
    const card = buildCardFromViewing({
      address: "1 Main",
      viewingAt: "",
      unitLabel: "",
      priceLabel: "",
      layoutLabel: "2B",
      listingUrl: "",
      setupNotes: "",
      pros: ["legacy pro"],
      risks: ["legacy risk"],
      aiSummary: sampleSummary,
      photos: [],
      disclaimer: "d",
    });
    expect(card.pros.map((p) => p.text)).toEqual(["Bright"]);
    expect(card.risks).toHaveLength(0);
    expect(card.facts[0]?.text).toBe("Roof 2018");
    expect(card.actionItems[0]?.text).toBe("Book inspection");
  });

  it("preserves prior selection across rebuild", () => {
    const first = buildCardFromViewing({
      address: "A",
      viewingAt: "",
      unitLabel: "",
      priceLabel: "",
      layoutLabel: "",
      listingUrl: "",
      setupNotes: "",
      pros: ["a", "b", "c", "d"],
      risks: [],
      aiSummary: null,
      photos: [{ id: 1, url: "https://x.test/a.jpg" }],
      disclaimer: "d",
    });
    first.pros[3]!.selected = true;
    first.photos[0]!.selected = false;
    const second = buildCardFromViewing({
      address: "A",
      viewingAt: "",
      unitLabel: "",
      priceLabel: "",
      layoutLabel: "",
      listingUrl: "",
      setupNotes: "",
      pros: ["a", "b", "c", "d"],
      risks: [],
      aiSummary: null,
      photos: [{ id: 1, url: "https://x.test/a.jpg" }],
      disclaimer: "d",
      previous: first,
    });
    expect(second.pros[3]!.selected).toBe(true);
    expect(second.photos[0]!.selected).toBe(false);
  });
});
