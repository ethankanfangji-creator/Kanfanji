import { describe, expect, it } from "vitest";
import type { FieldChecklistItem } from "@/lib/field-capture";
import {
  CHECKLIST_QUESTION_ID_BASE,
  deriveFieldChecklistFromQuestions,
  ensureDefaultFieldQuestions,
  getQuestionProgress,
  mergeChecklistIntoQuestions,
  partitionByAnswered,
  partitionQuestions,
  presentWizardQuestions,
  resolveQuestionStatus,
  syncQuestionAnswerToChecklist,
} from "./questions";
import { FIELD_CHECKLIST_IDS } from "@/lib/field-capture/checklist";

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

describe("default field questions", () => {
  const labels = Object.fromEntries(
    FIELD_CHECKLIST_IDS.map((id) => [id, id]),
  ) as Record<(typeof FIELD_CHECKLIST_IDS)[number], string>;

  it("seeds the 10 on-site checks in product order", () => {
    const seeded = ensureDefaultFieldQuestions([], labels);
    expect(seeded).toHaveLength(FIELD_CHECKLIST_IDS.length);
    expect(seeded.map((q) => q.basedOn)).toEqual(
      FIELD_CHECKLIST_IDS.map((id) => `preset:${id}`),
    );
    expect(seeded[0].id).toBe(CHECKLIST_QUESTION_ID_BASE);
    expect(seeded[0].text).toBe("light_air");
  });

  it("preserves answers and derives checklist status from questions", () => {
    const answered = ensureDefaultFieldQuestions(
      [
        {
          id: 1,
          text: "noise",
          checked: true,
          answer: "loud",
          source: "checklist",
          basedOn: "preset:noise",
        },
      ],
      labels,
    );
    const noise = answered.find((q) => q.basedOn === "preset:noise");
    expect(noise).toMatchObject({ checked: true, answer: "loud" });
    const derived = deriveFieldChecklistFromQuestions(answered, labels);
    expect(derived.find((item) => item.key === "noise")).toMatchObject({
      checked: true,
      note: "loud",
    });
    expect(derived.find((item) => item.key === "light_air")?.checked).toBe(false);
  });
});

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

describe("answer progress and status", () => {
  it("splits unanswered vs answered and computes progress", () => {
    const parts = partitionByAnswered([
      { id: 1, text: "open", checked: false },
      { id: 2, text: "done", checked: true, answer: "ok" },
      { id: 3, text: "checked-only", checked: true },
    ]);
    expect(parts.unanswered.map((q) => q.id)).toEqual([1]);
    expect(parts.answered.map((q) => q.id)).toEqual([2, 3]);
    expect(getQuestionProgress([...parts.unanswered, ...parts.answered])).toEqual({
      completed: 2,
      total: 3,
      ratio: 2 / 3,
    });
  });

  it("resolves processing / analyzing / failed statuses", () => {
    expect(
      resolveQuestionStatus({ id: 1, text: "q", checked: false }, { activeId: 1 }),
    ).toBe("processing");
    expect(
      resolveQuestionStatus({
        id: 2,
        text: "q",
        checked: false,
        analysisStatus: "analyzing",
      }),
    ).toBe("analyzing");
    expect(
      resolveQuestionStatus({
        id: 3,
        text: "q",
        checked: true,
        answer: "x",
        analysisStatus: "failed",
      }),
    ).toBe("analysis_failed");
  });

  it("presents hints and answer previews from notes / photos", () => {
    const presented = presentWizardQuestions(
      [
        {
          id: 1,
          text: "Leak?",
          checked: true,
          answer: "Yes",
          source: "photo",
          basedOn: "bathroom",
        },
      ],
      {
        notes: [{ transcript: "Matched transcript", matched: [1] }],
        photos: [{ tag: "bathroom", thumbUrl: "blob:thumb-1" }],
        labels: {
          tagLabel: "Tag: ",
          byDialogue: "From: ",
          checklistHint: "Checklist",
        },
      },
    );
    expect(presented[0].hint).toBe("Tag: bathroom");
    expect(presented[0].answerPreview).toMatchObject({
      noteSummary: "Yes",
      mediaThumbs: ["blob:thumb-1"],
    });
  });
});
