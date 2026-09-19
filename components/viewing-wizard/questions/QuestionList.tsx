"use client";

import { useMemo, useState } from "react";
import {
  getQuestionProgress,
  type WizardQuestion,
} from "@/lib/viewing-wizard/questions";
import {
  partitionByCategory,
  resolveTicketStatus,
  type ViewingBriefCategory,
} from "@/lib/viewing-wizard/viewing-brief";
import {
  AnswerMethodSheet,
  type AnswerMethod,
  type AnswerMethodSheetLabels,
} from "./AnswerMethodSheet";
import { QuestionCard, type QuestionCardLabels } from "./QuestionCard";

export type QuestionListMessages = {
  fieldTitle: string;
  progressLabel: string;
  sectionUnanswered: string;
  sectionAnswered: string;
  emptyUnanswered: string;
  emptyAnswered: string;
  tip: string;
  tipExample: string;
  card: QuestionCardLabels;
  methodSheet: AnswerMethodSheetLabels;
};

function categoryHeading(
  category: ViewingBriefCategory | "other",
  labels: QuestionCardLabels["categories"],
): string {
  return labels[category] ?? labels.other;
}

export function QuestionList({
  messages,
  questions,
  tipDetail,
  processingQuestionId = null,
  onSaveAnswer,
  onSelectMethod,
  onConfirmDiscovery,
  onIgnoreDiscovery,
  onAnswerViaComposer,
}: {
  messages: QuestionListMessages;
  questions: WizardQuestion[];
  tipDetail?: string;
  processingQuestionId?: number | null;
  onSaveAnswer: (id: number, answer: string) => void;
  onSelectMethod: (id: number, method: Exclude<AnswerMethod, "note">) => void;
  onConfirmDiscovery?: (id: number) => void;
  onIgnoreDiscovery?: (id: number) => void;
  onAnswerViaComposer?: (id: number) => void;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const progress = useMemo(() => getQuestionProgress(questions), [questions]);
  const byCategory = useMemo(() => partitionByCategory(questions), [questions]);
  const active = questions.find((question) => question.id === activeId) ?? null;
  const percent = Math.round(progress.ratio * 100);
  const statusActiveId = processingQuestionId ?? activeId;
  const toConfirmCount = questions.filter((q) => resolveTicketStatus(q) === "to_confirm").length;
  const needsMoreCount = questions.filter((q) => resolveTicketStatus(q) === "needs_more").length;

  return (
    <section className="ui-card mb-[var(--space-4)] min-w-0" aria-labelledby="step2-field-answer-title">
      <header className="space-y-[var(--space-3)]">
        <div className="flex flex-wrap items-end justify-between gap-[var(--space-2)]">
          <h2
            id="step2-field-answer-title"
            className="text-[var(--font-size-lg)] font-extrabold tracking-tight text-[var(--color-text)]"
          >
            {messages.fieldTitle}
          </h2>
          <p className="text-[var(--font-size-sm)] font-semibold text-[var(--color-text-muted)]" role="status">
            {messages.progressLabel
              .replace("{completed}", String(progress.completed))
              .replace("{total}", String(progress.total))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-[var(--color-text-muted)]">
          <span className="rounded-full border border-black/10 bg-[#F8F4EF] px-2.5 py-1">
            {messages.card.statusToConfirm} {toConfirmCount}
          </span>
          <span className="rounded-full border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1 text-[#991B1B]">
            {messages.card.statusNeedsMore} {needsMoreCount}
          </span>
          <span className="rounded-full border border-[#BBF7D0] bg-[#F0FDF4] px-2.5 py-1 text-[#166534]">
            {messages.card.statusAnswered} {progress.completed}
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-muted)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total || 100}
          aria-valuenow={progress.completed}
          aria-label={messages.progressLabel
            .replace("{completed}", String(progress.completed))
            .replace("{total}", String(progress.total))}
        >
          <div
            className="h-full rounded-full bg-[var(--color-text)] transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </header>

      <div className="mt-[var(--space-4)] space-y-[var(--space-5)]">
        {byCategory.length === 0 ? (
          <p className="text-[var(--font-size-sm)] text-[var(--color-text-muted)]">
            {messages.emptyUnanswered}
          </p>
        ) : (
          byCategory.map((section) => (
            <section
              key={section.category}
              aria-labelledby={`step2-cat-${section.category}`}
              className="space-y-[var(--space-3)]"
            >
              <h3
                id={`step2-cat-${section.category}`}
                className="text-[var(--font-size-xs)] font-extrabold tracking-widest text-[var(--color-text)]"
              >
                {categoryHeading(section.category, messages.card.categories)}
              </h3>
              <div className="space-y-[var(--space-3)]">
                {section.items.map((question) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    selected={activeId === question.id}
                    activeId={statusActiveId}
                    labels={messages.card}
                    onAnswer={setActiveId}
                    onConfirmDiscovery={onConfirmDiscovery}
                    onIgnoreDiscovery={onIgnoreDiscovery}
                    onAnswerDiscovery={(id) => {
                      if (onAnswerViaComposer) {
                        onAnswerViaComposer(id);
                        return;
                      }
                      setActiveId(id);
                    }}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        <div className="flex items-start gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-info-border)] bg-[var(--color-info-bg)] p-[var(--space-3)]">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-info)] text-[10px] font-bold text-white">
            AI
          </div>
          <p className="text-[var(--font-size-xs)] leading-[1.45] text-[var(--color-text-muted)]">
            {messages.tip}
            {tipDetail ?? messages.tipExample}
          </p>
        </div>
      </div>

      <AnswerMethodSheet
        open={activeId != null}
        question={active}
        labels={messages.methodSheet}
        onClose={() => setActiveId(null)}
        onSelectMethod={(method) => {
          if (activeId == null) return;
          const id = activeId;
          setActiveId(null);
          onSelectMethod(id, method);
        }}
        onSaveNote={(id, answer) => {
          onSaveAnswer(id, answer);
          setActiveId(null);
        }}
      />
    </section>
  );
}
