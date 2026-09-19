import { describe, expect, it } from "vitest";
import {
  addressHighlightsToQuestions,
  buildDeterministicAddressHighlights,
  mergeAddressHighlightQuestions,
  parseAiHighlightLines,
} from "./address-highlights";
import type { WizardQuestion } from "./questions";

describe("buildDeterministicAddressHighlights", () => {
  it("includes zoning and PID when Open Data is present", () => {
    const items = buildDeterministicAddressHighlights({
      address: "1200 Westwood St, Vancouver",
      market: "CA",
      openData: {
        city: "Vancouver",
        zoningCode: "RM-4",
        zoningLabel: "Multiple Dwelling",
        pid: "012-345-678",
      },
      neighborhood: "Kitsilano",
    });
    expect(items.some((i) => i.text.includes("RM-4"))).toBe(true);
    expect(items.some((i) => i.text.includes("012-345-678"))).toBe(true);
    expect(items.some((i) => i.text.includes("Kitsilano"))).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(8);
  });

  it("uses TH templates for Bangkok market", () => {
    const items = buildDeterministicAddressHighlights({
      address: "Sukhumvit 24",
      market: "TH",
    });
    expect(items.some((i) => /sinking fund|common-area|flood/i.test(i.text))).toBe(true);
  });
});

describe("mergeAddressHighlightQuestions", () => {
  it("does not duplicate existing question text", () => {
    const existing: WizardQuestion[] = [
      {
        id: 1,
        text: "Any visible cracks, settlement, or structural concerns?",
        checked: false,
        source: "checklist",
      },
    ];
    const highlights = buildDeterministicAddressHighlights({
      address: "Somewhere",
      market: "OTHER",
    });
    const merged = mergeAddressHighlightQuestions(existing, highlights);
    const texts = merged.map((q) => q.text.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("assigns stable address highlight ids", () => {
    const qs = addressHighlightsToQuestions([
      { text: "Ask about parking assignment.", source: "address" },
      { text: "Check envelope moisture.", source: "address" },
    ]);
    expect(qs[0]?.id).toBe(700_000);
    expect(qs[1]?.id).toBe(700_001);
  });
});

describe("parseAiHighlightLines", () => {
  it("strips bullets and numbering", () => {
    expect(
      parseAiHighlightLines("1. First must-ask question here\n- Second must-ask question here"),
    ).toEqual(["First must-ask question here", "Second must-ask question here"]);
  });
});
