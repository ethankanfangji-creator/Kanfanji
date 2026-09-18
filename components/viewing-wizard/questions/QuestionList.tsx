"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  partitionQuestions,
  type WizardQuestion,
} from "@/lib/viewing-wizard/questions";
import { AnswerSheet, type AnswerSheetLabels } from "./AnswerSheet";
import { QuestionCard, type QuestionCardLabels } from "./QuestionCard";

export type QuestionListMessages = {
  title: string;
  photoAi: string;
  followUp: string;
  checklistSection: string;
  tip: string;
  tipExample: string;
  matched: string;
  countLabel: string;
  card: QuestionCardLabels;
  answer: AnswerSheetLabels;
};

export function QuestionList({
  messages,
  marketLabel,
  questions,
  tipDetail,
  onToggle,
  onSaveAnswer,
}: {
  messages: QuestionListMessages;
  marketLabel: string;
  questions: WizardQuestion[];
  tipDetail?: string;
  onToggle: (id: number) => void;
  onSaveAnswer: (id: number, answer: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const parts = useMemo(() => partitionQuestions(questions), [questions]);
  const active = questions.find((question) => question.id === activeId) ?? null;

  return (
    <section className="ui-card mb-[var(--space-4)] min-w-0">
      <button
        type="button"
        aria-expanded={!collapsed}
        className="flex min-h-[var(--touch-target)] w-full items-center justify-between text-left"
        onClick={() => setCollapsed((value) => !value)}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--space-2)]">
          <h2 className="text-[var(--font-size-xs)] font-extrabold tracking-widest text-[var(--color-text)]">
            {messages.title} — {marketLabel}
          </h2>
          <span className="rounded-full bg-[var(--color-info-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-info)]">
            {messages.countLabel.replace("{count}", String(questions.length))}
          </span>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface-muted)]">
          {collapsed ? (
            <ChevronDown className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronUp className="h-4 w-4" aria-hidden />
          )}
        </span>
      </button>

      {!collapsed ? (
        <div className="mt-[var(--space-4)] space-y-[var(--space-4)]">
          <AnswerSheet
            question={active}
            labels={messages.answer}
            onSave={(id, answer) => {
              onSaveAnswer(id, answer);
              setActiveId(id);
            }}
          />

          {parts.photo.length > 0 ? (
            <div className="space-y-[var(--space-2)]">
              <p className="text-[var(--font-size-xs)] font-bold tracking-wide text-[#047857]">
                {messages.photoAi}
              </p>
              {parts.photo.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  selected={activeId === question.id}
                  labels={messages.card}
                  onSelect={setActiveId}
                  onToggle={onToggle}
                />
              ))}
            </div>
          ) : null}

          {parts.bank.length > 0 ? (
            <div className="space-y-[var(--space-2)]">
              {parts.bank.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  selected={activeId === question.id}
                  labels={messages.card}
                  onSelect={setActiveId}
                  onToggle={onToggle}
                />
              ))}
            </div>
          ) : null}

          {parts.checklist.length > 0 ? (
            <div className="space-y-[var(--space-2)]">
              <p className="text-[var(--font-size-xs)] font-bold tracking-wide text-[var(--color-text-muted)]">
                {messages.checklistSection}
              </p>
              {parts.checklist.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  selected={activeId === question.id}
                  labels={messages.card}
                  onSelect={setActiveId}
                  onToggle={onToggle}
                />
              ))}
            </div>
          ) : null}

          {parts.followUp.length > 0 ? (
            <div className="space-y-[var(--space-2)]">
              <p className="text-[var(--font-size-xs)] font-bold tracking-wide text-[#7C3AED]">
                {messages.followUp}
              </p>
              {parts.followUp.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  selected={activeId === question.id}
                  labels={messages.card}
                  onSelect={setActiveId}
                  onToggle={onToggle}
                />
              ))}
            </div>
          ) : null}

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
      ) : null}
    </section>
  );
}
