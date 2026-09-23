"use client";

import { useEffect, useState } from "react";
import { FIELD_CATALOG } from "@/lib/viewing-chat/collection/field-catalog";
import { resolveFieldDisplayStatus } from "@/lib/viewing-chat/collection/field-display";
import type {
  PropertyCollectionRecord,
  PropertyFieldId,
  PropertyFactStatus,
} from "@/lib/viewing-chat/collection/types";
import {
  FieldStatusBadge,
  type FieldDisplayStatus,
} from "@/components/viewing-chat/FieldStatusBadge";

export type ReviewCardLabels = {
  title: string;
  hint: string;
  confirm: string;
  keepCollecting: string;
  markUnknown: string;
  saveField: string;
  valuePlaceholder: string;
  share: string;
  shared: string;
  statusConfirmed: string;
  statusSubjective: string;
  statusInferred: string;
  statusMissing: string;
  statusSkipped: string;
  statusConflict: string;
};

export type ReviewFieldDraft = {
  fieldId: PropertyFieldId;
  value: string;
  status: PropertyFactStatus;
};

function toDraft(record: PropertyCollectionRecord | null | undefined): ReviewFieldDraft[] {
  return FIELD_CATALOG.map((entry) => {
    const field = record?.fields[entry.fieldId];
    return {
      fieldId: entry.fieldId,
      value:
        field?.value === null || field?.value === undefined
          ? ""
          : String(field.value),
      status: field?.status ?? "unknown",
    };
  });
}

function displayStatus(draft: ReviewFieldDraft, skipped: PropertyFieldId[]): FieldDisplayStatus {
  return resolveFieldDisplayStatus({
    fieldId: draft.fieldId,
    status: draft.status,
    value: draft.value,
    skippedFields: skipped,
  });
}

/** Plain-text summary for clipboard / native share */
export function formatReviewSummaryText(input: {
  address?: string | null;
  drafts: ReviewFieldDraft[];
  skippedFields: PropertyFieldId[];
  fieldLabels: Record<string, string>;
  statusLabels: Record<FieldDisplayStatus, string>;
}): string {
  const lines = [
    input.address ? `看房摘要 · ${input.address}` : "看房摘要",
    "",
  ];
  for (const draft of input.drafts) {
    const status = displayStatus(draft, input.skippedFields);
    const label = input.fieldLabels[draft.fieldId] ?? draft.fieldId;
    const value =
      status === "missing" || status === "skipped"
        ? input.statusLabels[status]
        : draft.value.trim() || "—";
    lines.push(`${label}（${input.statusLabels[status]}）：${value}`);
  }
  return lines.join("\n");
}

export function ReviewCard({
  record,
  skippedFields,
  fieldLabels,
  labels,
  address,
  busy,
  onConfirm,
  onKeepCollecting,
  onShare,
}: {
  record: PropertyCollectionRecord | null | undefined;
  skippedFields: PropertyFieldId[];
  fieldLabels: Record<string, string>;
  labels: ReviewCardLabels;
  address?: string | null;
  busy?: boolean;
  onConfirm: (drafts: ReviewFieldDraft[]) => void;
  onKeepCollecting: () => void;
  onShare?: (drafts: ReviewFieldDraft[]) => void | Promise<void>;
}) {
  const [drafts, setDrafts] = useState<ReviewFieldDraft[]>(() => toDraft(record));
  const [shareNote, setShareNote] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(toDraft(record));
  }, [record]);

  const statusLabels: Record<FieldDisplayStatus, string> = {
    confirmed: labels.statusConfirmed,
    subjective: labels.statusSubjective,
    inferred: labels.statusInferred,
    missing: labels.statusMissing,
    skipped: labels.statusSkipped,
    conflict: labels.statusConflict,
  };

  async function handleShare() {
    if (!onShare) {
      const text = formatReviewSummaryText({
        address,
        drafts,
        skippedFields,
        fieldLabels,
        statusLabels,
      });
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          setShareNote(labels.shared);
          return;
        }
      } catch {
        /* fall through */
      }
      setShareNote(labels.shared);
      return;
    }
    await onShare(drafts);
    setShareNote(labels.shared);
  }

  return (
    <div className="flex h-full min-h-0 flex-col border border-[#93C5FD] bg-[#EFF6FF]">
      <div className="shrink-0 border-b border-[#93C5FD]/60 px-3 py-2.5">
        <h2 className="text-[13px] font-bold text-[#1E3A8A]">{labels.title}</h2>
        <p className="mt-0.5 text-[11px] text-[#1E40AF]">{labels.hint}</p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-2">
        {drafts.map((draft, index) => {
          const status = displayStatus(draft, skippedFields);
          return (
            <div
              key={draft.fieldId}
              className="rounded-lg border border-black/5 bg-white px-2.5 py-2"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[12px] font-bold text-[#1A1A1A]">
                  {fieldLabels[draft.fieldId] ?? draft.fieldId}
                </p>
                <FieldStatusBadge status={status} labels={statusLabels} />
              </div>
              <input
                value={draft.value}
                disabled={busy}
                placeholder={labels.valuePlaceholder}
                onChange={(event) => {
                  const value = event.target.value;
                  setDrafts((prev) =>
                    prev.map((row, i) =>
                      i === index
                        ? {
                            ...row,
                            value,
                            status: value.trim() ? "confirmed" : "unknown",
                          }
                        : row,
                    ),
                  );
                }}
                className="w-full rounded-md border border-black/10 bg-[#FAF6F1] px-2 py-1.5 text-[12px] outline-none focus:border-[#2563EB]"
              />
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDrafts((prev) =>
                      prev.map((row, i) =>
                        i === index
                          ? { ...row, value: "", status: "unknown" }
                          : row,
                      ),
                    );
                  }}
                  className="rounded-full bg-[#F3F4F6] px-2.5 py-1 text-[10px] font-semibold text-[#4B5563] disabled:opacity-40"
                >
                  {labels.markUnknown}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-[#93C5FD]/60 px-3 py-2.5">
        {shareNote ? (
          <p className="text-center text-[11px] font-semibold text-[#166534]">{shareNote}</p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onKeepCollecting}
            className="flex-1 rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] font-bold text-[#374151] disabled:opacity-40"
          >
            {labels.keepCollecting}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleShare()}
            className="flex-1 rounded-full border border-[#2563EB]/40 bg-[#EFF6FF] px-3 py-2 text-[12px] font-bold text-[#1E40AF] disabled:opacity-40"
          >
            {labels.share}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(drafts)}
            className="flex-1 rounded-full bg-[#2563EB] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-40"
          >
            {labels.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
