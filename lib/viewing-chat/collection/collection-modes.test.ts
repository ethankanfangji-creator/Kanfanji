import { describe, expect, it } from "vitest";
import { fillFocusSlot } from "./fill-focus-slot";
import { applyPropertyIntelInferences } from "./apply-intel-inferences";
import { extractPropertyFacts } from "./extract-property-facts";
import { visionSlotsToInferredFacts } from "./vision-slots";
import { mergeRuleAndLlmFacts } from "./llm-extract";
import { buildOpeningBubble, OPENING_FOCUS_FIELD } from "../opening";
import { emptyIntel } from "@/lib/property-intel/types";

describe("opening bubble", () => {
  it("sets a soft focus and invites freeform talk", () => {
    const opening = buildOpeningBubble("台北市大安區", "zh-Hant");
    expect(opening.focusFieldIds).toEqual([OPENING_FOCUS_FIELD]);
    expect(opening.message.text).toMatch(/看房紀錄助理/);
    expect(opening.message.text).toMatch(/不是房仲|估價師/);
    expect(opening.message.text).not.toMatch(/^1\.\s/);
  });
});

describe("Explicit A — fillFocusSlot", () => {
  it("attributes short answer to focus field", () => {
    const facts = fillFocusSlot({
      text: "Federal Pioneer",
      focusFieldIds: ["electrical"],
      messageId: "m1",
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.fieldId).toBe("electrical");
    expect(facts[0]?.value).toBe("Federal Pioneer");
    expect(facts[0]?.status).toBe("confirmed");
    expect(facts[0]?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("does not store duplicated capture echo as the answer", () => {
    const result = extractPropertyFacts({
      text: "沒有特別的氣味",
      messageId: "m-odor",
      focusFieldIds: ["odor"],
      // Mirrors normalizeCaptures echoing message.text
      captures: [
        {
          kind: "text",
          text: "沒有特別的氣味",
          messageId: "m-odor",
        },
      ],
    });
    const odor = result.fields.find((f) => f.fieldId === "odor");
    expect(odor?.value).toBe("沒有特別的氣味");
    expect(String(odor?.value)).not.toMatch(/\n/);
    expect(String(odor?.rawText)).not.toMatch(
      /沒有特別的氣味[\s\S]*沒有特別的氣味/,
    );
  });

  it("does not steal multi-field freeform turns", () => {
    const facts = fillFocusSlot({
      text: "有點霉味",
      focusFieldIds: ["odor"],
      alreadyExtractedFieldIds: ["odor", "noise"],
    });
    expect(facts).toEqual([]);
  });
});

describe("Implicit B — extract + focus", () => {
  it("fills electrical via focus when user answers explicitly", () => {
    const result = extractPropertyFacts({
      text: "Federal",
      messageId: "e1",
      focusFieldIds: ["electrical"],
    });
    expect(result.fields.find((f) => f.fieldId === "electrical")?.value).toBe(
      "Federal",
    );
  });

  it("still extracts freeform multi-field without focus", () => {
    const result = extractPropertyFacts({
      text: "這廚房剛翻新，但廁所有點霉味",
      messageId: "b1",
    });
    expect(result.fields.some((f) => f.fieldId === "odor")).toBe(true);
  });
});

describe("Contextual C — intel + vision slots", () => {
  it("maps intel year/layout to inferred facts", () => {
    const intel = emptyIntel("2143 Clarke St", "2143 Clarke St");
    intel.basic.year = 1978;
    intel.basic.beds = 2;
    intel.basic.baths = 1;
    const facts = applyPropertyIntelInferences(intel);
    expect(facts.find((f) => f.fieldId === "year_built")?.value).toBe(1978);
    expect(facts.find((f) => f.fieldId === "year_built")?.status).toBe("inferred");
    expect(facts.find((f) => f.fieldId === "layout")?.value).toMatch(/2房/);
  });

  it("maps vision electrical slot to inferred", () => {
    const facts = visionSlotsToInferredFacts(
      {
        extractedText: "",
        observedConditions: [],
        uncertainItems: [],
        confidence: 0.7,
        slots: [
          {
            fieldId: "electrical",
            value: "Federal Pioneer",
            confidence: 0.7,
            note: "panel label",
          },
        ],
      },
      "photo1",
    );
    expect(facts[0]?.fieldId).toBe("electrical");
    expect(facts[0]?.status).toBe("inferred");
    expect(facts[0]?.rawText).toMatch(/照片辨識/);
  });
});

describe("mergeRuleAndLlmFacts", () => {
  it("lets rules win over LLM on same field", () => {
    const merged = mergeRuleAndLlmFacts(
      [
        {
          fieldId: "price",
          value: 12_800_000,
          status: "confirmed",
          confidence: 0.9,
          sourceMessageId: "a",
          rawText: "1280萬",
        },
      ],
      [
        {
          fieldId: "price",
          value: 15_000_000,
          status: "confirmed",
          confidence: 0.5,
          sourceMessageId: "a",
          rawText: "guess",
        },
        {
          fieldId: "noise",
          value: "吵",
          status: "confirmed",
          confidence: 0.7,
          sourceMessageId: "a",
          rawText: "吵",
        },
      ],
    );
    expect(merged.find((f) => f.fieldId === "price")?.value).toBe(12_800_000);
    expect(merged.find((f) => f.fieldId === "noise")?.value).toBe("吵");
  });
});
