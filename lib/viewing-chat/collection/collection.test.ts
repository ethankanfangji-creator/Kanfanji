import { describe, expect, it } from "vitest";
import {
  createEmptyPropertyRecord,
  mergePropertyFacts,
  type ExtractedPropertyFact,
} from "./index";

function fact(
  partial: Pick<ExtractedPropertyFact, "fieldId" | "value" | "status" | "rawText"> &
    Partial<ExtractedPropertyFact>,
): ExtractedPropertyFact {
  return {
    confidence: 0.9,
    sourceMessageId: "m1",
    ...partial,
  };
}

describe("mergePropertyFacts", () => {
  it("applies user price correction over the old value and records correction evidence", () => {
    let record = createEmptyPropertyRecord();
    let merged = mergePropertyFacts(record, [
      fact({
        fieldId: "price",
        value: 12_800_000,
        status: "confirmed",
        rawText: "1280萬",
        sourceMessageId: "m1",
      }),
    ]);
    record = merged.record;
    expect(record.fields.price?.value).toBe(12_800_000);

    merged = mergePropertyFacts(record, [
      fact({
        fieldId: "price",
        value: 12_500_000,
        status: "corrected",
        rawText: "1250萬",
        sourceMessageId: "m2",
      }),
    ], { evidence: merged.evidence });

    expect(merged.record.fields.price?.value).toBe(12_500_000);
    expect(merged.record.fields.price?.status).toBe("corrected");
    expect(merged.conflicts.some((c) => c.kind === "correction")).toBe(true);
  });

  it("does not silently overwrite conflicting confirmed values", () => {
    let record = createEmptyPropertyRecord();
    let merged = mergePropertyFacts(record, [
      fact({
        fieldId: "price",
        value: 12_800_000,
        status: "confirmed",
        rawText: "1280萬",
        sourceMessageId: "a",
      }),
    ]);
    record = merged.record;

    merged = mergePropertyFacts(record, [
      fact({
        fieldId: "price",
        value: 15_000_000,
        status: "confirmed",
        rawText: "1500萬",
        sourceMessageId: "b",
      }),
    ], { evidence: merged.evidence });

    expect(merged.record.fields.price?.value).toBe(12_800_000);
    expect(merged.record.fields.price?.hasConflict).toBe(true);
    expect(merged.conflicts.some((c) => c.kind === "conflict")).toBe(true);
  });

  it("merges noise supplement without dropping prior layout", () => {
    let record = createEmptyPropertyRecord();
    let merged = mergePropertyFacts(record, [
      fact({
        fieldId: "layout",
        value: "2房1廳",
        status: "confirmed",
        rawText: "格局 2房1廳",
      }),
    ]);
    record = merged.record;

    merged = mergePropertyFacts(record, [
      fact({
        fieldId: "noise",
        value: "陽台外有高架很吵",
        status: "confirmed",
        rawText: "對了陽台外有高架很吵",
        sourceMessageId: "m2",
      }),
    ], { evidence: merged.evidence });

    expect(merged.record.fields.layout?.value).toMatch(/2房1廳/);
    expect(merged.record.fields.noise?.rawText).toMatch(/高架|吵/);
  });
});
