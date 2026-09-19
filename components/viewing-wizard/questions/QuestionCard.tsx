"use client";

import type {
  QuestionAnswerStatus,
  WizardQuestion,
} from "@/lib/viewing-wizard/questions";
import { resolveQuestionStatus } from "@/lib/viewing-wizard/questions";
import {
  resolveTicketStatus,
  type ViewingBriefTicketStatus,
} from "@/lib/viewing-wizard/viewing-brief";

export type QuestionCardLabels = {
  answerCta: string;
  editCta: string;
  statusUnanswered: string;
  statusProcessing: string;
  statusAnswered: string;
  statusAnalyzing: string;
  statusAnalysisFailed: string;
  statusToConfirm: string;
  statusNeedsMore: string;
  noteSummaryLabel: string;
  aiSummaryLabel: string;
  priorityHigh: string;
  priorityMedium: string;
  priorityLow: string;
  discoveryBadge?: string;
  discoveryConfirm?: string;
  discoveryIgnore?: string;
  discoveryAnswer?: string;
  categories: {
    condition: string;
    transit: string;
    amenities: string;
    costs_docs: string;
    onsite_confirm: string;
    other: string;
  };
};

function ticketStatusLabel(
  status: ViewingBriefTicketStatus,
  analysis: QuestionAnswerStatus,
  labels: QuestionCardLabels,
): string {
  if (analysis === "processing") return labels.statusProcessing;
  if (analysis === "analyzing") return labels.statusAnalyzing;
  if (analysis === "analysis_failed") return labels.statusAnalysisFailed;
  switch (status) {
    case "answered":
      return labels.statusAnswered;
    case "needs_more":
      return labels.statusNeedsMore;
    default:
      return labels.statusToConfirm;
  }
}

function ticketStatusTone(
  status: ViewingBriefTicketStatus,
  analysis: QuestionAnswerStatus,
): string {
  if (analysis === "processing" || analysis === "analyzing") {
    return "bg-[var(--color-info-bg)] text-[var(--color-info)] border-[var(--color-info-border)]";
  }
  if (analysis === "analysis_failed" || status === "needs_more") {
    return "bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger-border)]";
  }
  if (status === "answered") {
    return "bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]";
  }
  return "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] border-[var(--color-border)]";
}

function priorityLabel(
  priority: WizardQuestion["priority"],
  labels: QuestionCardLabels,
): string | null {
  if (priority === "high") return labels.priorityHigh;
  if (priority === "medium") return labels.priorityMedium;
  if (priority === "low") return labels.priorityLow;
  return null;
}

function categoryLabel(
  category: WizardQuestion["category"],
  labels: QuestionCardLabels,
): string | null {
  if (!category) return null;
  if (category in labels.categories) {
    return labels.categories[category as keyof QuestionCardLabels["categories"]];
  }
  return labels.categories.other;
}

function priorityTone(priority: WizardQuestion["priority"]): string {
  if (priority === "high") return "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]";
  if (priority === "medium") return "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]";
  return "bg-[#F3F4F6] text-[#4B5563] border-[#E5E7EB]";
}

export function QuestionCard({
  question,
  selected,
  activeId,
  labels,
  onAnswer,
  onConfirmDiscovery,
  onIgnoreDiscovery,
  onAnswerDiscovery,
}: {
  question: WizardQuestion;
  selected: boolean;
  activeId?: number | null;
  labels: QuestionCardLabels;
  onAnswer: (id: number) => void;
  onConfirmDiscovery?: (id: number) => void;
  onIgnoreDiscovery?: (id: number) => void;
  onAnswerDiscovery?: (id: number) => void;
}) {
  const analysis = resolveQuestionStatus(question, { activeId });
  const ticketStatus = resolveTicketStatus(question);
  const category = categoryLabel(question.category, labels);
  const priority = priorityLabel(question.priority, labels);
  const hint = question.hint || question.description;
  const preview = question.answerPreview;
  const isPendingDiscovery =
    question.source === "ai_discovery" && question.discoveryStatus === "pending";
  const cta =
    ticketStatus === "answered" || ticketStatus === "needs_more" || analysis === "analysis_failed"
      ? labels.editCta
      : labels.answerCta;

  return (
    <article
      data-question-id={question.id}
      className={`w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] text-left shadow-[var(--shadow-card)] ${
        selected ? "ring-2 ring-[var(--color-focus)]/30" : ""
      } ${isPendingDiscovery ? "border-[#FDE68A] bg-[#FFFBEB]/40" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        {isPendingDiscovery && labels.discoveryBadge ? (
          <span className="rounded-full border border-[#FDE68A] bg-[#FEF3C7] px-2.5 py-1 text-[10px] font-bold text-[#92400E]">
            {labels.discoveryBadge}
          </span>
        ) : null}
        {category ? (
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1 text-[10px] font-bold text-[var(--color-text)]">
            {category}
          </span>
        ) : null}
        {priority ? (
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${priorityTone(
              question.priority,
            )}`}
          >
            {priority}
          </span>
        ) : null}
        <span
          className={`ml-auto shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${ticketStatusTone(
            ticketStatus,
            analysis,
          )}`}
        >
          {ticketStatusLabel(ticketStatus, analysis, labels)}
        </span>
      </div>

      <h3 className="mt-[var(--space-3)] text-[var(--font-size-sm)] font-bold leading-[1.35] text-[var(--color-text)]">
        {question.text}
      </h3>

      {question.description && question.description !== hint ? (
        <p className="mt-[var(--space-2)] text-[var(--font-size-xs)] leading-[1.45] text-[var(--color-text-muted)]">
          {question.description}
        </p>
      ) : hint ? (
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

      {isPendingDiscovery ? (
        <div className="mt-[var(--space-4)] flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="ui-button ui-button--primary min-h-[var(--touch-target)] flex-1"
            onClick={() => {
              if (onAnswerDiscovery) onAnswerDiscovery(question.id);
              else onAnswer(question.id);
            }}
          >
            {labels.discoveryAnswer ?? labels.answerCta}
          </button>
          <button
            type="button"
            className="min-h-[var(--touch-target)] flex-1 rounded-full border border-black/10 bg-white text-[13px] font-bold"
            onClick={() => onConfirmDiscovery?.(question.id)}
          >
            {labels.discoveryConfirm ?? "Confirm"}
          </button>
          <button
            type="button"
            className="min-h-[var(--touch-target)] flex-1 rounded-full border border-black/10 bg-white text-[13px] font-bold text-[#6B7280]"
            onClick={() => onIgnoreDiscovery?.(question.id)}
          >
            {labels.discoveryIgnore ?? "Ignore"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="ui-button ui-button--primary mt-[var(--space-4)] min-h-[var(--touch-target)] w-full"
          onClick={() => onAnswer(question.id)}
          aria-pressed={selected}
        >
          {cta}
        </button>
      )}
    </article>
  );
}
