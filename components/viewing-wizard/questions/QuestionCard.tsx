"use client";

import { Check } from "lucide-react";
import type { WizardQuestion } from "@/lib/viewing-wizard/questions";

export type QuestionCardLabels = {
  photoBadge: string;
  followBadge: string;
  checklistBadge: string;
  tagLabel: string;
  byDialogue: string;
  answered: string;
};

export function QuestionCard({
  question,
  selected,
  labels,
  onSelect,
  onToggle,
}: {
  question: WizardQuestion;
  selected: boolean;
  labels: QuestionCardLabels;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
}) {
  const isPhoto = question.isDynamic && question.source === "photo";
  const isFollowUp = Boolean(question.isFollowUp);
  const isChecklist = question.source === "checklist";

  const tone = question.checked
    ? isPhoto
      ? "bg-[#065F46] text-white border-[#065F46]"
      : isFollowUp
        ? "bg-[#4C1D95] text-white border-[#4C1D95]"
        : "bg-[var(--color-text)] text-white border-[var(--color-text)]"
    : isPhoto
      ? "bg-[#ECFDF5] border-[#A7F3D0] hover:bg-[#D1FAE5]"
      : isFollowUp
        ? "bg-[#F5F3FF] border-[#DDD6FE] hover:bg-[#EDE9FE]"
        : isChecklist
          ? "bg-[var(--color-surface-muted)] border-[var(--color-border)] hover:bg-[var(--color-surface)]"
          : "bg-[var(--color-surface-muted)] border-[var(--color-border)] hover:bg-[var(--color-surface)]";

  return (
    <div
      className={`w-full rounded-[var(--radius-md)] border p-[var(--space-3)] text-left transition ${tone} ${
        selected ? "ring-2 ring-[var(--color-focus)]/30" : ""
      }`}
    >
      <div className="flex items-start gap-[var(--space-2)]">
        <button
          type="button"
          role="checkbox"
          aria-checked={question.checked}
          aria-label={question.text}
          onClick={() => onToggle(question.id)}
          className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border transition ${
            question.checked
              ? "border-white/30 bg-white/15 text-white"
              : "border-[var(--color-border)] bg-[var(--color-surface)] text-transparent"
          }`}
        >
          <Check className="h-5 w-5" aria-hidden />
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => onSelect(question.id)}
          aria-pressed={selected}
        >
          <span className="flex items-start gap-1.5 text-[var(--font-size-sm)] font-bold leading-[1.35]">
            {!question.checked && isPhoto ? (
              <span className="mt-0.5 shrink-0 rounded-full bg-[#059669] px-1.5 py-0.5 text-[9px] font-bold text-white">
                {labels.photoBadge}
              </span>
            ) : null}
            {!question.checked && isFollowUp ? (
              <span className="mt-0.5 shrink-0 rounded-full bg-[#7C3AED] px-1.5 py-0.5 text-[9px] font-bold text-white">
                {labels.followBadge}
              </span>
            ) : null}
            {!question.checked && isChecklist ? (
              <span className="mt-0.5 shrink-0 rounded-full bg-[var(--color-text-muted)] px-1.5 py-0.5 text-[9px] font-bold text-white">
                {labels.checklistBadge}
              </span>
            ) : null}
            {question.text}
          </span>
          {question.basedOn && !isChecklist ? (
            <span
              className={`mt-1.5 block text-[var(--font-size-xs)] leading-[1.4] ${
                question.checked ? "text-white/70" : "text-[var(--color-text-muted)]"
              }`}
            >
              {isPhoto ? labels.tagLabel : labels.byDialogue}
              {question.basedOn}
            </span>
          ) : null}
          {question.answer ? (
            <span
              className={`mt-1.5 block text-[var(--font-size-xs)] ${
                question.checked ? "text-white/80" : "text-[var(--color-text-muted)]"
              }`}
            >
              {labels.answered}: {question.answer}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
