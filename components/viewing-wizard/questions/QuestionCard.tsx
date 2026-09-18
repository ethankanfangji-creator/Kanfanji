"use client";

import type {
  QuestionAnswerStatus,
  WizardQuestion,
} from "@/lib/viewing-wizard/questions";
import { resolveQuestionStatus } from "@/lib/viewing-wizard/questions";

export type QuestionCardLabels = {
  answerCta: string;
  editCta: string;
  statusUnanswered: string;
  statusProcessing: string;
  statusAnswered: string;
  statusAnalyzing: string;
  statusAnalysisFailed: string;
  noteSummaryLabel: string;
  aiSummaryLabel: string;
};

function statusLabel(status: QuestionAnswerStatus, labels: QuestionCardLabels): string {
  switch (status) {
    case "processing":
      return labels.statusProcessing;
    case "answered":
      return labels.statusAnswered;
    case "analyzing":
      return labels.statusAnalyzing;
    case "analysis_failed":
      return labels.statusAnalysisFailed;
    default:
      return labels.statusUnanswered;
  }
}

function statusTone(status: QuestionAnswerStatus): string {
  switch (status) {
    case "answered":
      return "bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]";
    case "processing":
      return "bg-[var(--color-info-bg)] text-[var(--color-info)] border-[var(--color-info-border)]";
    case "analyzing":
      return "bg-[var(--color-info-bg)] text-[var(--color-info)] border-[var(--color-info-border)]";
    case "analysis_failed":
      return "bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger-border)]";
    default:
      return "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] border-[var(--color-border)]";
  }
}

export function QuestionCard({
  question,
  selected,
  activeId,
  labels,
  onAnswer,
}: {
  question: WizardQuestion;
  selected: boolean;
  activeId?: number | null;
  labels: QuestionCardLabels;
  onAnswer: (id: number) => void;
}) {
  const status = resolveQuestionStatus(question, { activeId });
  const hint = question.hint || question.description;
  const preview = question.answerPreview;
  const cta = status === "answered" || status === "analysis_failed" ? labels.editCta : labels.answerCta;

  return (
    <article
      data-question-id={question.id}
      className={`w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] text-left shadow-[var(--shadow-card)] ${
        selected ? "ring-2 ring-[var(--color-focus)]/30" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-[var(--space-2)]">
        <h3 className="min-w-0 flex-1 text-[var(--font-size-sm)] font-bold leading-[1.35] text-[var(--color-text)]">
          {question.text}
        </h3>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusTone(status)}`}
        >
          {statusLabel(status, labels)}
        </span>
      </div>

      {hint ? (
        <p className="mt-[var(--space-2)] text-[var(--font-size-xs)] leading-[1.45] text-[var(--color-text-muted)]">
          {hint}
        </p>
      ) : null}

      {preview?.mediaThumbs && preview.mediaThumbs.length > 0 ? (
        <div className="mt-[var(--space-3)] flex flex-wrap gap-[var(--space-2)]">
          {preview.mediaThumbs.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element -- local blob / remote thumbs for answer preview
            <img
              key={src}
              src={src}
              alt=""
              className="h-14 w-14 rounded-[var(--radius-control)] object-cover border border-[var(--color-border)]"
            />
          ))}
        </div>
      ) : null}

      {preview?.noteSummary ? (
        <p className="mt-[var(--space-3)] rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] px-[var(--space-3)] py-[var(--space-2)] text-[var(--font-size-xs)] leading-[1.45] text-[var(--color-text)]">
          <span className="font-bold text-[var(--color-text-muted)]">{labels.noteSummaryLabel} </span>
          {preview.noteSummary}
        </p>
      ) : null}

      {preview?.aiSummary ? (
        <p className="mt-[var(--space-2)] rounded-[var(--radius-control)] border border-[var(--color-info-border)] bg-[var(--color-info-bg)] px-[var(--space-3)] py-[var(--space-2)] text-[var(--font-size-xs)] leading-[1.45] text-[var(--color-info)]">
          <span className="font-bold">{labels.aiSummaryLabel} </span>
          {preview.aiSummary}
        </p>
      ) : null}

      <button
        type="button"
        className="ui-button ui-button--primary mt-[var(--space-4)] min-h-[var(--touch-target)] w-full"
        onClick={() => onAnswer(question.id)}
        aria-pressed={selected}
      >
        {cta}
      </button>
    </article>
  );
}
