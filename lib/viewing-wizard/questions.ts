import type { FieldChecklistItem } from "@/lib/field-capture";

/** Stable numeric id range reserved for checklist-backed questions. */
export const CHECKLIST_QUESTION_ID_BASE = 800_000;

export type WizardQuestion = {
  id: number;
  text: string;
  checked: boolean;
  answer?: string;
  isFollowUp?: boolean;
  basedOn?: string;
  isDynamic?: boolean;
  source?: "photo" | "audio" | "opendata" | "checklist" | string;
  aiJobId?: string;
};

export function isChecklistQuestion(question: WizardQuestion): boolean {
  return question.source === "checklist";
}

/**
 * Fold field-checklist items into the intelligent question list.
 * Does not delete checklist rows — only mirrors them as answerable questions.
 */
export function mergeChecklistIntoQuestions(
  questions: WizardQuestion[],
  checklist: FieldChecklistItem[],
): WizardQuestion[] {
  const byChecklistId = new Set(
    questions
      .filter(isChecklistQuestion)
      .map((question) => question.basedOn)
      .filter((value): value is string => Boolean(value)),
  );
  const byText = new Set(questions.map((question) => question.text.trim().toLowerCase()));

  const extras: WizardQuestion[] = [];
  checklist.forEach((item, index) => {
    if (byChecklistId.has(item.id)) return;
    const normalized = item.text.trim().toLowerCase();
    if (!normalized || byText.has(normalized)) return;
    extras.push({
      id: CHECKLIST_QUESTION_ID_BASE + index,
      text: item.text,
      checked: item.checked,
      answer: item.note.trim() ? item.note : undefined,
      isDynamic: true,
      source: "checklist",
      basedOn: item.id,
    });
    byText.add(normalized);
  });

  return extras.length ? [...questions, ...extras] : questions;
}

/** Keep legacy fieldChecklist rows in sync when checklist-backed questions change. */
export function syncQuestionAnswerToChecklist(
  checklist: FieldChecklistItem[],
  question: WizardQuestion,
): FieldChecklistItem[] {
  if (!isChecklistQuestion(question) || !question.basedOn) return checklist;
  let changed = false;
  const next = checklist.map((item) => {
    if (item.id !== question.basedOn) return item;
    const note = question.answer?.trim() ?? "";
    if (item.checked === question.checked && item.note === note) return item;
    changed = true;
    return { ...item, checked: question.checked, note };
  });
  return changed ? next : checklist;
}

export function partitionQuestions(questions: WizardQuestion[]) {
  const photo = questions.filter((q) => q.isDynamic && q.source === "photo");
  const followUp = questions.filter((q) => q.isFollowUp);
  const checklist = questions.filter(isChecklistQuestion);
  const bank = questions.filter(
    (q) =>
      !q.isFollowUp &&
      !(q.isDynamic && q.source === "photo") &&
      !isChecklistQuestion(q),
  );
  return { photo, bank, followUp, checklist };
}
