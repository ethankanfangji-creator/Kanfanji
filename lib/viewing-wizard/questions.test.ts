import { describe, expect, it } from "vitest";
import type { FieldChecklistItem } from "@/lib/field-capture";
import {
  mergeChecklistIntoQuestions,
  partitionQuestions,
  syncQuestionAnswerToChecklist,
} from "./questions";

const checklist: FieldChecklistItem[] = [
  {
    id: "preset:water_leak",
    key: "water_leak",
    text: "漏水或水痕",
    checked: false,
    note: "",
    custom: false,
    sortOrder: 0,
  },
  {
    id: "preset:noise",
    key: "noise",
    text: "噪音",
    checked: true,
    note: "夜間明顯",
    custom: false,
    sortOrder: 1,
  },
];

describe("mergeChecklistIntoQuestions", () => {
  it("mirrors checklist items into intelligent questions without dropping bank items", () => {
    const merged = mergeChecklistIntoQuestions(
      [{ id: 1, text: "電箱廠牌？", checked: false }],
      checklist,
    );
    expect(merged).toHaveLength(3);
    expect(merged.filter((q) => q.source === "checklist")).toHaveLength(2);
    expect(merged.find((q) => q.basedOn === "preset:noise")).toMatchObject({
      checked: true,
      answer: "夜間明顯",
    });
  });

  it("skips duplicates already present by text or checklist id", () => {
    const once = mergeChecklistIntoQuestions([], checklist);
    const twice = mergeChecklistIntoQuestions(once, checklist);
    expect(twice).toHaveLength(checklist.length);
  });
});

describe("syncQuestionAnswerToChecklist", () => {
  it("updates the linked checklist row when a checklist question is answered", () => {
    const next = syncQuestionAnswerToChecklist(checklist, {
      id: 800_000,
      text: "漏水或水痕",
      checked: true,
      answer: "天花有水痕",
      source: "checklist",
      basedOn: "preset:water_leak",
    });
    expect(next[0]).toMatchObject({
      checked: true,
      note: "天花有水痕",
    });
  });
});

describe("partitionQuestions", () => {
  it("groups photo, bank, follow-up, and checklist questions", () => {
    const parts = partitionQuestions([
      { id: 1, text: "bank", checked: false },
      { id: 2, text: "photo", checked: false, isDynamic: true, source: "photo" },
      { id: 3, text: "follow", checked: false, isFollowUp: true },
      {
        id: 800_001,
        text: "check",
        checked: false,
        source: "checklist",
        basedOn: "preset:noise",
      },
    ]);
    expect(parts.bank).toHaveLength(1);
    expect(parts.photo).toHaveLength(1);
    expect(parts.followUp).toHaveLength(1);
    expect(parts.checklist).toHaveLength(1);
  });
});
