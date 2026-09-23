/**
 * Summary / review display status — completion ≠ all fields filled.
 * Buckets: confirmed · subjective · inferred · missing (unconfirmed) · skipped · conflict
 */

import { getCatalogEntry } from "./field-catalog";
import type {
  PropertyCollectionRecord,
  PropertyFieldId,
  PropertyFactStatus,
} from "./types";

export type FieldDisplayStatus =
  | "confirmed"
  | "subjective"
  | "inferred"
  | "missing"
  | "skipped"
  | "conflict";

export function resolveFieldDisplayStatus(input: {
  fieldId: PropertyFieldId;
  status?: PropertyFactStatus | null;
  value?: string | number | boolean | null;
  hasConflict?: boolean;
  skippedFields: PropertyFieldId[];
}): FieldDisplayStatus {
  if (input.hasConflict) return "conflict";
  if (input.skippedFields.includes(input.fieldId)) return "skipped";

  const empty =
    input.value === null ||
    input.value === undefined ||
    input.value === "" ||
    input.status === "unknown";

  if (empty && !input.status) return "missing";
  if (input.status === "unknown" || empty) return "missing";
  if (input.status === "inferred") return "inferred";

  const kind = getCatalogEntry(input.fieldId)?.valueKind ?? "fact";
  if (kind === "subjective") return "subjective";
  return "confirmed";
}

export function resolveRecordFieldDisplayStatus(input: {
  fieldId: PropertyFieldId;
  record: PropertyCollectionRecord | null | undefined;
  skippedFields: PropertyFieldId[];
}): FieldDisplayStatus {
  const field = input.record?.fields[input.fieldId];
  return resolveFieldDisplayStatus({
    fieldId: input.fieldId,
    status: field?.status,
    value: field?.value,
    hasConflict: field?.hasConflict,
    skippedFields: input.skippedFields,
  });
}
