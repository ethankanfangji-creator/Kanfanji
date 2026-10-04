import { describe, expect, it } from "vitest";
import { applyPropertyIntelInferences } from "./apply-intel-inferences";
import { visionSlotsToInferredFacts } from "./vision-slots";
import { emptyIntel } from "@/lib/property-intel/types";

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
