"use client";

import { FIELD_CATALOG } from "@/lib/viewing-chat/collection/field-catalog";
import { resolveRecordFieldDisplayStatus } from "@/lib/viewing-chat/collection/field-display";
import type { RecordChange } from "@/lib/viewing-chat/collection/orchestrator-types";
import type {
  PropertyCollectionRecord,
  PropertyFieldId,
} from "@/lib/viewing-chat/collection/types";
import {
  FieldStatusBadge,
  type FieldDisplayStatus,
} from "@/components/viewing-chat/FieldStatusBadge";
import { formatValue } from "@/lib/viewing-chat/collection/format-value";

const SECTION_ORDER: FieldDisplayStatus[] = [
  "confirmed",
  "subjective",
  "inferred",
  "missing",
  "skipped",
  "conflict",
];

export type PropertySummaryLabels = {
  title: string;
  empty: string;
  changesTitle: string;
  noChanges: string;
  statusConfirmed: string;
  statusSubjective: string;
  statusInferred: string;
  statusMissing: string;
  statusSkipped: string;
  statusConflict: string;
  sectionConfirmed: string;
  sectionSubjective: string;
  sectionInferred: string;
  sectionMissing: string;
  sectionSkipped: string;
  changeAdded: string;
  changeUpdated: string;
  changeCorrected: string;
  changeConflict: string;
  changeSkipped: string;
  changeUnknown: string;
  openSummary: string;
  closeSummary: string;
};

export function PropertySummaryPanel({
  record,
  skippedFields,
  changes,
  labels,
  fieldLabels,
  compact,
}: {
  record: PropertyCollectionRecord | null | undefined;
  skippedFields: PropertyFieldId[];
  changes: RecordChange[];
  labels: PropertySummaryLabels;
  /** Short display names keyed by fieldId */
  fieldLabels: Record<string, string>;
  compact?: boolean;
}) {
  const statusLabels: Record<FieldDisplayStatus, string> = {
    confirmed: labels.statusConfirmed,
    subjective: labels.statusSubjective,
    inferred: labels.statusInferred,
    missing: labels.statusMissing,
    skipped: labels.statusSkipped,
    conflict: labels.statusConflict,
  };

  const sectionTitle = (status: FieldDisplayStatus): string => {
    switch (status) {
      case "confirmed":
        return labels.sectionConfirmed;
      case "subjective":
        return labels.sectionSubjective;
      case "inferred":
        return labels.sectionInferred;
      case "missing":
        return labels.sectionMissing;
      case "skipped":
        return labels.sectionSkipped;
      case "conflict":
        return labels.statusConflict;
      default:
        return status;
    }
  };

  const changeKindLabel = (kind: RecordChange["kind"]) => {
    switch (kind) {
      case "added":
        return labels.changeAdded;
      case "updated":
        return labels.changeUpdated;
      case "corrected":
        return labels.changeCorrected;
      case "conflict":
        return labels.changeConflict;
      case "skipped":
        return labels.changeSkipped;
      case "unknown":
        return labels.changeUnknown;
      default:
        return kind;
    }
  };

  const grouped = SECTION_ORDER.map((status) => ({
    status,
    rows: FIELD_CATALOG.filter(
      (entry) =>
        resolveRecordFieldDisplayStatus({
          fieldId: entry.fieldId,
          record,
          skippedFields,
        }) === status,
    ),
  })).filter((g) => g.rows.length > 0);

  return (
    <div
      className={`flex min-h-0 flex-col bg-white ${
        compact ? "" : "h-full border-l border-black/8"
      }`}
    >
      {compact ? null : (
        <div className="shrink-0 border-b border-black/8 px-3 py-2.5">
          <h2 className="text-[13px] font-bold text-[#1A1A1A]">{labels.title}</h2>
        </div>
      )}

      <div
        className={
          compact
            ? "px-3 py-2"
            : "min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2"
        }
      >
        <section className="mb-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">
            {labels.changesTitle}
          </p>
          {changes.length === 0 ? (
            <p className="text-[12px] text-[#6B7280]">{labels.noChanges}</p>
          ) : (
            <ul className="space-y-1">
              {changes.slice(0, 8).map((change, index) => (
                <li
                  key={`${change.fieldId}_${change.kind}_${index}`}
                  className="rounded-lg bg-[#FAF6F1] px-2.5 py-1.5 text-[12px] text-[#374151]"
                >
                  <span className="font-semibold text-[#1E40AF]">
                    {changeKindLabel(change.kind)}
                  </span>
                  <span className="mx-1 text-[#9CA3AF]">·</span>
                  <span className="font-semibold">
                    {fieldLabels[change.fieldId] ?? change.fieldId}
                  </span>
                  {change.nextValue != null && change.nextValue !== "" ? (
                    <span className="mt-0.5 block truncate text-[#4B5563]">
                      {formatValue(change.nextValue)}
                    </span>
                  ) : change.rawText ? (
                    <span className="mt-0.5 block truncate text-[#4B5563]">
                      {change.rawText}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          {grouped.map((group) => (
            <div key={group.status}>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">
                {sectionTitle(group.status)}
              </p>
              <ul className="space-y-1.5">
                {group.rows.map((entry) => {
                  const status = group.status;
                  const field = record?.fields[entry.fieldId];
                  const valueText =
                    status === "missing" || status === "skipped"
                      ? labels.statusMissing
                      : formatValue(field?.value) || field?.rawText || "—";
                  return (
                    <li
                      key={entry.fieldId}
                      className="flex items-start justify-between gap-2 rounded-lg border border-black/5 px-2.5 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-bold text-[#1A1A1A]">
                          {fieldLabels[entry.fieldId] ?? entry.fieldId}
                        </p>
                        <p
                          className={`mt-0.5 truncate text-[12px] ${
                            status === "missing" || status === "skipped"
                              ? "text-[#9CA3AF]"
                              : "text-[#4B5563]"
                          }`}
                        >
                          {valueText}
                        </p>
                      </div>
                      <FieldStatusBadge status={status} labels={statusLabels} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!record ? (
            <p className="mt-3 text-[12px] text-[#6B7280]">{labels.empty}</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
