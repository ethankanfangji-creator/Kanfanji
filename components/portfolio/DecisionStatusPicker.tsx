"use client";

import {
  DECISION_STATUSES,
  type DecisionStatus,
  toggleDecisionStatus,
} from "@/lib/portfolio";

export type DecisionStatusLabels = {
  label: string;
  none: string;
  liked: string;
  shortlist: string;
  passed: string;
  revisit: string;
};

export function DecisionStatusPicker({
  value,
  labels,
  onChange,
  compact,
}: {
  value: DecisionStatus | null;
  labels: DecisionStatusLabels;
  onChange: (next: DecisionStatus | null) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-1 ${compact ? "" : "gap-1.5"}`}
      role="group"
      aria-label={labels.label}
    >
      {!compact ? (
        <span className="mr-1 text-[11px] font-semibold text-[#6B7280]">{labels.label}</span>
      ) : null}
      {DECISION_STATUSES.map((status) => {
        const active = value === status;
        const text =
          status === "liked"
            ? labels.liked
            : status === "shortlist"
              ? labels.shortlist
              : status === "passed"
                ? labels.passed
                : labels.revisit;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(toggleDecisionStatus(value, status))}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold touch-manipulation transition-colors ${
              active
                ? "bg-black text-white"
                : "bg-black/5 text-[#374151] hover:bg-black/10"
            }`}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
