import { COMPARE_MAX, COMPARE_MIN, type ComparisonDraft, type CompareViewingInput } from "./types";
import { projectComparisonColumn } from "./project";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildComparisonDraft(
  viewings: CompareViewingInput[],
): ComparisonDraft {
  if (viewings.length < COMPARE_MIN || viewings.length > COMPARE_MAX) {
    throw new Error(`COMPARE_COUNT_${COMPARE_MIN}_${COMPARE_MAX}`);
  }
  const now = new Date().toISOString();
  return {
    version: 1,
    id: newId(),
    createdAt: now,
    updatedAt: now,
    columns: viewings.map(projectComparisonColumn),
    sort: { key: "rating", direction: "desc" },
    shareToken: null,
  };
}

export function touchComparison(draft: ComparisonDraft): ComparisonDraft {
  return { ...draft, updatedAt: new Date().toISOString() };
}

export function toComparisonShareSnapshot(draft: ComparisonDraft) {
  return {
    version: 1 as const,
    id: draft.id,
    updatedAt: draft.updatedAt,
    sort: draft.sort,
    columns: draft.columns.filter((c) => c.included),
  };
}
