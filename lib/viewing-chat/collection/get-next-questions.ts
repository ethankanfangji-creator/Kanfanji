import { FIELD_CATALOG, questionForField } from "./field-catalog";
import type {
  GetNextQuestionsInput,
  NextQuestion,
  PropertyCollectionRecord,
  PropertyFactEvidence,
  PropertyFieldId,
} from "./types";

const MAX_QUESTIONS = 3;

function isFieldSatisfied(
  record: PropertyCollectionRecord,
  fieldId: PropertyFieldId,
): boolean {
  const f = record.fields[fieldId];
  if (!f) return false;
  if (f.status === "unknown") return false;
  if (f.hasConflict) return false;
  if (f.value === null || f.value === "") return false;
  // Inferred alone is not enough to stop asking — still a gap to confirm
  if (f.status === "inferred") return false;
  return f.status === "confirmed" || f.status === "corrected";
}

/**
 * Derive up to 3 follow-up questions from gaps + importance.
 * Returns [] when mode is confirming/reporting, or when nothing important is missing.
 */
export function getNextQuestions(
  record: PropertyCollectionRecord,
  evidence: PropertyFactEvidence[],
  skippedFields: PropertyFieldId[],
  locale?: string,
): NextQuestion[];
export function getNextQuestions(input: GetNextQuestionsInput): NextQuestion[];
export function getNextQuestions(
  recordOrInput: PropertyCollectionRecord | GetNextQuestionsInput,
  evidence?: PropertyFactEvidence[],
  skippedFields?: PropertyFieldId[],
  locale?: string,
): NextQuestion[] {
  const isObjectForm =
    recordOrInput &&
    typeof recordOrInput === "object" &&
    "record" in recordOrInput;

  const record = isObjectForm
    ? (recordOrInput as GetNextQuestionsInput).record
    : (recordOrInput as PropertyCollectionRecord);
  const skipped = new Set(
    (isObjectForm
      ? (recordOrInput as GetNextQuestionsInput).skippedFields
      : (skippedFields ?? [])
    ).map(String),
  );
  const loc = isObjectForm
    ? (recordOrInput as GetNextQuestionsInput).locale
    : locale;

  // evidence reserved for future ranking (recency / conflict boost)
  void (isObjectForm
    ? (recordOrInput as GetNextQuestionsInput).evidence
    : evidence);

  if (record.mode === "confirming" || record.mode === "reporting") {
    return [];
  }

  const unresolvedConflicts = new Set<PropertyFieldId>();
  for (const id of Object.keys(record.fields) as PropertyFieldId[]) {
    if (record.fields[id]?.hasConflict) unresolvedConflicts.add(id);
  }

  const candidates: NextQuestion[] = [];

  for (const entry of FIELD_CATALOG) {
    if (skipped.has(entry.fieldId)) continue;
    if (isFieldSatisfied(record, entry.fieldId)) continue;

    let priority = entry.importance;
    // Boost fields with unresolved conflicts so we ask the user to clarify
    if (unresolvedConflicts.has(entry.fieldId)) {
      priority += 25;
    }
    // Slight boost if only inferred
    if (record.fields[entry.fieldId]?.status === "inferred") {
      priority += 10;
    }

    candidates.push({
      fieldId: entry.fieldId,
      question: questionForField(entry.fieldId, loc ?? "zh-Hant"),
      priority,
      skippable: true,
    });
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates.slice(0, MAX_QUESTIONS);
}
