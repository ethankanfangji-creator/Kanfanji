/**
 * Completeness scoring + conflict detection for sourced property fields.
 */

import type { PropertyData, SourcedField } from "./types";
import { CORE_FIELD_PATHS } from "./market-fields";

function walkCoreFields(
  data: PropertyData,
): Array<{ path: string; field: SourcedField<unknown> }> {
  return [
    { path: "location.normalizedAddress", field: data.location.normalizedAddress },
    { path: "location.country", field: data.location.country },
    { path: "listing.price", field: data.listing.price },
    { path: "listing.currency", field: data.listing.currency },
    { path: "listing.bedrooms", field: data.listing.bedrooms },
    { path: "listing.bathrooms", field: data.listing.bathrooms },
    { path: "listing.area", field: data.listing.area },
    { path: "identity.propertyType", field: data.identity.propertyType },
    { path: "identity.yearBuilt", field: data.identity.yearBuilt },
    { path: "costs.hoaOrManagementFee", field: data.costs.hoaOrManagementFee },
    { path: "costs.propertyTax", field: data.costs.propertyTax },
  ];
}

export function countFilledCoreFields(data: PropertyData): number {
  return walkCoreFields(data).filter((f) => f.field.value != null && f.field.value !== "")
    .length;
}

export function scoreDataCompleteness(data: PropertyData): {
  score: number;
  missingFields: string[];
  verifiedFields: string[];
  unverifiedFields: string[];
} {
  const rows = walkCoreFields(data);
  const missingFields: string[] = [];
  const verifiedFields: string[] = [];
  const unverifiedFields: string[] = [];

  for (const { path, field } of rows) {
    if (field.value == null || field.value === "") {
      missingFields.push(path);
      continue;
    }
    if (field.verificationStatus === "verified") verifiedFields.push(path);
    else unverifiedFields.push(path);
  }

  const filled = rows.length - missingFields.length;
  const score = rows.length === 0 ? 0 : filled / rows.length;
  return { score, missingFields, verifiedFields, unverifiedFields };
}

export type FieldConflict = {
  path: string;
  values: Array<{ value: unknown; sourceIds: string[] }>;
};

/**
 * Detect conflicts when the same path has multiple non-equal values
 * from different sources (caller passes candidate list).
 */
export function detectValueConflicts(
  candidates: Array<{ path: string; value: unknown; sourceId: string }>,
): FieldConflict[] {
  const byPath = new Map<
    string,
    Array<{ value: unknown; sourceIds: string[] }>
  >();

  for (const c of candidates) {
    if (c.value == null || c.value === "") continue;
    const key = `${c.path}::${normalizeCompare(c.value)}`;
    const list = byPath.get(c.path) ?? [];
    const existing = list.find(
      (x) => normalizeCompare(x.value) === normalizeCompare(c.value),
    );
    if (existing) {
      if (!existing.sourceIds.includes(c.sourceId)) {
        existing.sourceIds.push(c.sourceId);
      }
    } else {
      list.push({ value: c.value, sourceIds: [c.sourceId] });
    }
    byPath.set(c.path, list);
  }

  const conflicts: FieldConflict[] = [];
  for (const [path, values] of byPath) {
    if (values.length > 1) conflicts.push({ path, values });
  }
  return conflicts;
}

function normalizeCompare(v: unknown): string {
  if (typeof v === "number") return String(v);
  return String(v).trim().toLowerCase().replace(/\s+/g, " ");
}

export function mergeSourcedFieldPreferHigherConfidence<T>(
  a: SourcedField<T>,
  b: SourcedField<T>,
): SourcedField<T> {
  if (a.value == null) return b;
  if (b.value == null) return a;
  if (
    a.value != null &&
    b.value != null &&
    normalizeCompare(a.value) !== normalizeCompare(b.value)
  ) {
    return {
      value: a.value,
      normalizedValue: a.normalizedValue,
      sourceIds: [...new Set([...a.sourceIds, ...b.sourceIds])],
      confidence: Math.min(a.confidence, b.confidence),
      verificationStatus: "conflicting",
      notes:
        a.notes || b.notes
          ? `${a.notes} | ${b.notes}`.trim()
          : `Conflict: ${String(a.value)} vs ${String(b.value)}`,
    };
  }
  return a.confidence >= b.confidence
    ? {
        ...a,
        sourceIds: [...new Set([...a.sourceIds, ...b.sourceIds])],
      }
    : {
        ...b,
        sourceIds: [...new Set([...a.sourceIds, ...b.sourceIds])],
      };
}

export { CORE_FIELD_PATHS };
