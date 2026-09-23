import { FIELD_CATALOG, questionForField } from "./field-catalog";
import {
  COMPOSITE_GROUPS,
  allowedFieldsForDepth,
  clarifyQuestionForField,
  compositeQuestion,
  confirmQuestion,
  pickPendingConfirmFromRecord,
  preferredFieldsForDepth,
  type PendingConfirm,
} from "./dialogue-strategy";
import type {
  GetNextQuestionsInput,
  NextQuestion,
  PropertyCollectionRecord,
  PropertyFactEvidence,
  PropertyFieldId,
} from "./types";
import type { SuggestedQuestion } from "./orchestrator-types";

const MAX_QUESTIONS = 3;

/** Fields that often pair — used to pick “worth reminding” after a turn, not a fixed agenda. */
export const RELATED: Partial<Record<PropertyFieldId, PropertyFieldId[]>> = {
  price: ["area", "layout"],
  area: ["price", "layout", "floor"],
  layout: ["area", "light", "noise"],
  noise: ["odor", "light", "cons"],
  odor: ["noise", "water_damage"],
  pros: ["cons", "light"],
  cons: ["pros", "noise", "water_damage"],
  light: ["layout", "pros"],
  transit: ["noise", "parking"],
  water_damage: ["odor", "plumbing", "amenities"],
  amenities: ["water_damage", "plumbing"],
  electrical: ["water_damage"],
  plumbing: ["water_damage", "amenities"],
};

function isFieldSatisfied(
  record: PropertyCollectionRecord,
  fieldId: PropertyFieldId,
): boolean {
  const f = record.fields[fieldId];
  if (!f) return false;
  if (f.status === "unknown") return false;
  if (f.hasConflict) return false;
  if (f.value === null || f.value === "") return false;
  // Inferred alone is not enough to stop reminding — still a gap to confirm
  if (f.status === "inferred") return false;
  // 招3 — low-confidence placeholders still need clarifying
  if (typeof f.confidence === "number" && f.confidence <= 0.25) return false;
  return f.status === "confirmed" || f.status === "corrected";
}

export type GetRemindersInput = GetNextQuestionsInput & {
  /** Field ids touched this turn — reminders should react to what just changed */
  changedFieldIds?: PropertyFieldId[];
  /** 招4 — user turns completed including this one (1-based after turn) */
  userTurnCount?: number;
  /** 招3 — fields that need clarify after vague answer */
  clarifyFieldIds?: PropertyFieldId[];
  /** 招1 — existing pending confirm */
  pendingConfirm?: PendingConfirm | null;
};

/**
 * Up to 3 optional reminders: confirm → clarify → composite → open,
 * filtered by progressive depth (招4).
 */
export function getNextQuestions(
  record: PropertyCollectionRecord,
  evidence: PropertyFactEvidence[],
  skippedFields: PropertyFieldId[],
  locale?: string,
  changedFieldIds?: PropertyFieldId[],
): NextQuestion[];
export function getNextQuestions(input: GetRemindersInput): SuggestedQuestion[];
export function getNextQuestions(
  recordOrInput: PropertyCollectionRecord | GetRemindersInput,
  evidence?: PropertyFactEvidence[],
  skippedFields?: PropertyFieldId[],
  locale?: string,
  changedFieldIds?: PropertyFieldId[],
): NextQuestion[] | SuggestedQuestion[] {
  const isObjectForm =
    recordOrInput &&
    typeof recordOrInput === "object" &&
    "record" in recordOrInput;

  const record = isObjectForm
    ? (recordOrInput as GetRemindersInput).record
    : (recordOrInput as PropertyCollectionRecord);
  const skipped = new Set(
    (isObjectForm
      ? (recordOrInput as GetRemindersInput).skippedFields
      : (skippedFields ?? [])
    ).map(String),
  );
  const loc =
    (isObjectForm
      ? (recordOrInput as GetRemindersInput).locale
      : locale) ?? "zh-Hant";
  const changed = new Set(
    (isObjectForm
      ? (recordOrInput as GetRemindersInput).changedFieldIds
      : changedFieldIds) ?? [],
  );
  const userTurnCount = isObjectForm
    ? (recordOrInput as GetRemindersInput).userTurnCount ?? 1
    : 1;
  const clarifyFieldIds = isObjectForm
    ? (recordOrInput as GetRemindersInput).clarifyFieldIds ?? []
    : [];
  const pendingIn = isObjectForm
    ? (recordOrInput as GetRemindersInput).pendingConfirm
    : null;

  void (isObjectForm
    ? (recordOrInput as GetRemindersInput).evidence
    : evidence);

  if (record.mode === "confirming" || record.mode === "reporting") {
    return [];
  }

  const results: SuggestedQuestion[] = [];

  // 招3 — clarify first
  for (const id of clarifyFieldIds) {
    if (skipped.has(id)) continue;
    results.push({
      fieldId: id,
      question: clarifyQuestionForField(id, loc),
      priority: 200,
      skippable: true,
      kind: "clarify",
    });
  }

  // 招1 — Yes/No confirm inferred candidate
  const pending =
    pendingIn ??
    pickPendingConfirmFromRecord(
      record,
      [...preferredFieldsForDepth(userTurnCount)],
    );
  if (pending && !skipped.has(pending.fieldId) && results.length < MAX_QUESTIONS) {
    results.push({
      fieldId: pending.fieldId,
      question: confirmQuestion(pending, loc),
      priority: 190,
      skippable: true,
      kind: "confirm",
      candidateValue: pending.candidateValue,
    });
    // Don't mix Yes/No with open/composite in the same bubble —
    // otherwise users can't tell which line a short reply answers.
    return results.slice(0, 1);
  }

  const preferred = preferredFieldsForDepth(userTurnCount);
  const allowed = allowedFieldsForDepth(userTurnCount);

  const unresolvedConflicts = new Set<PropertyFieldId>();
  for (const id of Object.keys(record.fields) as PropertyFieldId[]) {
    if (record.fields[id]?.hasConflict) unresolvedConflicts.add(id);
  }

  const relatedBoost = new Set<PropertyFieldId>();
  for (const id of changed) {
    for (const rel of RELATED[id] ?? []) relatedBoost.add(rel);
  }

  const gapIds: PropertyFieldId[] = [];
  for (const entry of FIELD_CATALOG) {
    if (skipped.has(entry.fieldId)) continue;
    if (!allowed.has(entry.fieldId)) continue;
    if (isFieldSatisfied(record, entry.fieldId)) continue;
    if (changed.has(entry.fieldId)) continue;
    if (results.some((r) => r.fieldId === entry.fieldId)) continue;
    gapIds.push(entry.fieldId);
  }

  // Prefer current depth band when ranking
  const score = (fieldId: PropertyFieldId): number => {
    const entry = FIELD_CATALOG.find((e) => e.fieldId === fieldId);
    let priority = entry?.importance ?? 40;
    if (preferred.has(fieldId)) priority += 30;
    if (unresolvedConflicts.has(fieldId)) priority += 40;
    if (relatedBoost.has(fieldId)) priority += 18;
    if (record.fields[fieldId]?.status === "inferred") priority += 12;
    if (
      typeof record.fields[fieldId]?.confidence === "number" &&
      (record.fields[fieldId]?.confidence ?? 1) <= 0.25
    ) {
      priority += 50;
    }
    return priority;
  };

  // 招2 — try one composite from a group with ≥2 gaps
  if (results.length < MAX_QUESTIONS) {
    for (const group of COMPOSITE_GROUPS) {
      const open = group.filter((id) => gapIds.includes(id));
      if (open.length < 2) continue;
      if (open.some((id) => results.some((r) => r.fieldId === id))) continue;
      const primary = open.slice().sort((a, b) => score(b) - score(a))[0]!;
      results.push({
        fieldId: primary,
        fieldIds: open,
        question: compositeQuestion(open, loc),
        priority: 160 + open.length,
        skippable: true,
        kind: "composite",
      });
      break;
    }
  }

  const openCandidates = gapIds
    .filter((id) => !results.some((r) => r.fieldId === id || r.fieldIds?.includes(id)))
    .map((fieldId) => ({
      fieldId,
      question: questionForField(fieldId, loc),
      priority: score(fieldId),
      skippable: true as const,
      kind: "open" as const,
    }))
    .sort((a, b) => b.priority - a.priority);

  for (const c of openCandidates) {
    if (results.length >= MAX_QUESTIONS) break;
    results.push(c);
  }

  return results.slice(0, MAX_QUESTIONS);
}
