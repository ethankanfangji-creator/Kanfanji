import { describe, expect, it } from "vitest";
import { askPortfolio } from "./ask";
import type { PortfolioFactCard } from "./types";

const card: PortfolioFactCard = {
  id: "v1",
  address: "1 Main",
  updatedAt: "2026-10-02T00:00:00.000Z",
  decisionStatus: null,
  tags: [],
  price: "1400000",
  layout: "3房",
  area: null,
  pros: [],
  risks: [],
  summary: null,
  notesExcerpt: "採光好",
  fields: { price: "1400000" },
  shareComments: [],
};

describe("askPortfolio", () => {
  it("returns a clear message when question is empty", async () => {
    const result = await askPortfolio({
      apiKey: "sk-test",
      question: "   ",
      cards: [card],
      locale: "zh-Hant",
    });
    expect(result.matchedIds).toEqual([]);
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it("returns a clear message when corpus is empty", async () => {
    const result = await askPortfolio({
      apiKey: "sk-test",
      question: "哪幾間便宜？",
      cards: [],
      locale: "zh-Hant",
    });
    expect(result.matchedIds).toEqual([]);
    expect(result.suggestCompare).toBe(false);
    expect(result.answer).toMatch(/沒有看房記錄|no viewings/i);
  });
});
