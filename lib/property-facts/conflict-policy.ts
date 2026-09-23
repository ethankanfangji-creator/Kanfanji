/**
 * Conflict resolution policy (address match → source → freshness).
 * When candidates tie on all keys but values differ, do not pick a winner.
 */

import type { Evidence, MatchLevel, SourceType } from "./types";
import { SOURCE_TYPE_PRIORITY } from "./types";
import { valuesEqual } from "./evidence";

/** Lower index wins. Exact address beats street / neighborhood (postal-ish) / inferred. */
export const MATCH_LEVEL_PRIORITY: Record<MatchLevel, number> = {
  exact_unit: 0,
  exact_parcel: 1,
  street: 2,
  neighborhood: 3,
  inferred: 4,
};

export function isEstimatedSource(sourceType: SourceType): boolean {
  return (
    sourceType === "model_estimate" ||
    sourceType === "area_statistic"
  );
}

export function asOfMillis(e: Evidence<unknown>): number {
  const raw = e.effectiveDate || e.retrievedAt || e.fetchedAt;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Compare two live evidence rows for the same field.
 * Negative → a wins; positive → b wins; 0 → tie on policy keys.
 */
export function compareEvidence(a: Evidence<unknown>, b: Evidence<unknown>): number {
  const ma = MATCH_LEVEL_PRIORITY[a.matchLevel] ?? 99;
  const mb = MATCH_LEVEL_PRIORITY[b.matchLevel] ?? 99;
  if (ma !== mb) return ma - mb;

  const sa = SOURCE_TYPE_PRIORITY[a.sourceType] ?? 99;
  const sb = SOURCE_TYPE_PRIORITY[b.sourceType] ?? 99;
  if (sa !== sb) return sa - sb;

  // Newer effectiveDate / retrievedAt wins
  return asOfMillis(b) - asOfMillis(a);
}

export type ResolveDecision<T> =
  | {
      kind: "winner";
      winner: Evidence<T>;
      conflicts: Evidence<T>[];
    }
  | {
      kind: "unresolved_conflict";
      candidates: Evidence<T>[];
    }
  | {
      kind: "empty";
    };

/**
 * Pick a clear winner or declare unresolved conflict.
 * Estimates should be filtered out before calling for "found" paths.
 */
export function decideEvidenceWinner<T>(live: Evidence<T>[]): ResolveDecision<T> {
  if (live.length === 0) return { kind: "empty" };
  if (live.length === 1) {
    return { kind: "winner", winner: live[0]!, conflicts: [] };
  }

  const sorted = [...live].sort(compareEvidence);
  const top = sorted[0]!;
  const tied: Evidence<T>[] = [top];
  for (let i = 1; i < sorted.length; i++) {
    const row = sorted[i]!;
    if (compareEvidence(top, row) === 0) tied.push(row);
    else break;
  }

  // Among policy-tied rows, if all values equal → merge as winner (newest meta already first)
  const distinct = tied.filter(
    (e, idx) => tied.findIndex((o) => valuesEqual(o.value, e.value)) === idx,
  );
  if (distinct.length === 1) {
    const conflicts = sorted
      .slice(1)
      .filter((e) => !valuesEqual(e.value, top.value));
    return { kind: "winner", winner: top, conflicts };
  }

  // Policy tie + different values → do not pick
  if (tied.length >= 2 && distinct.length >= 2) {
    return { kind: "unresolved_conflict", candidates: tied };
  }

  const conflicts = sorted.slice(1).filter((e) => !valuesEqual(e.value, top.value));
  return { kind: "winner", winner: top, conflicts };
}
