"use client";

import { useMemo, useState } from "react";
import {
  getQuestionProgress,
  partitionByAnswered,
  type WizardQuestion,
} from "@/lib/viewing-wizard/questions";
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

export function QuestionList({
  messages,
  questions,
  tipDetail,
  processingQuestionId = null,
  onSaveAnswer,
  onSelectMethod,
}: {
  messages: QuestionListMessages;
  questions: WizardQuestion[];
  tipDetail?: string;
  processingQuestionId?: number | null;
  onSaveAnswer: (id: number, answer: string) => void;
  onSelectMethod: (id: number, method: Exclude<AnswerMethod, "note">) => void;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const progress = useMemo(() => getQuestionProgress(questions), [questions]);
  const sections = useMemo(() => partitionByAnswered(questions), [questions]);
  const active = questions.find((question) => question.id === activeId) ?? null;
  const percent = Math.round(progress.ratio * 100);
  const statusActiveId = processingQuestionId ?? activeId;

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

      <div className="mt-[var(--space-4)] space-y-[var(--space-4)]">
        <section aria-labelledby="step2-unanswered-heading" className="space-y-[var(--space-3)]">
          <h3
            id="step2-unanswered-heading"
            className="text-[var(--font-size-xs)] font-extrabold tracking-widest text-[var(--color-text)]"
          >
            {messages.sectionUnanswered}
          </h3>
          {sections.unanswered.length === 0 ? (
            <p className="text-[var(--font-size-sm)] text-[var(--color-text-muted)]">
              {messages.emptyUnanswered}
            </p>
          ) : (
            <div className="space-y-[var(--space-3)]">
              {sections.unanswered.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  selected={activeId === question.id}
                  activeId={statusActiveId}
                  labels={messages.card}
                  onAnswer={setActiveId}
                />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="step2-answered-heading" className="space-y-[var(--space-3)]">
          <h3
            id="step2-answered-heading"
            className="text-[var(--font-size-xs)] font-extrabold tracking-widest text-[var(--color-text)]"
          >
            {messages.sectionAnswered}
          </h3>
          {sections.answered.length === 0 ? (
            <p className="text-[var(--font-size-sm)] text-[var(--color-text-muted)]">
              {messages.emptyAnswered}
            </p>
          ) : (
            <div className="space-y-[var(--space-3)]">
              {sections.answered.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  selected={activeId === question.id}
                  activeId={statusActiveId}
                  labels={messages.card}
                  onAnswer={setActiveId}
                />
              ))}
            </div>
          )}
        </section>

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
