"use client";

import { useState } from "react";
import type { WizardQuestion } from "@/lib/viewing-wizard/questions";

export type AnswerSheetLabels = {
  title: string;
  placeholder: string;
  save: string;
  clear: string;
  empty: string;
};

function AnswerSheetEditor({
  question,
  labels,
  onSave,
}: {
  question: WizardQuestion;
  labels: AnswerSheetLabels;
  onSave: (id: number, answer: string) => void;
}) {
  const [draft, setDraft] = useState(question.answer ?? "");

  return (
    <section
      aria-label={labels.title}
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] shadow-[var(--shadow-card)]"
    >
      <h3 className="text-[var(--font-size-xs)] font-extrabold tracking-widest text-[var(--color-text)]">
        {labels.title}
      </h3>
      <p className="mt-[var(--space-2)] text-[var(--font-size-sm)] font-semibold leading-[1.4] text-[var(--color-text)]">
        {question.text}
      </p>
      <label className="mt-[var(--space-3)] block">
        <span className="sr-only">{labels.placeholder}</span>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          placeholder={labels.placeholder}
          className="w-full min-h-[var(--touch-target)] resize-none rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-[var(--space-4)] py-[var(--space-3)] text-[16px] text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus)]/20 sm:text-[var(--font-size-sm)]"
        />
      </label>
      <div className="mt-[var(--space-3)] flex flex-col gap-[var(--space-2)] sm:flex-row">
        <button
          type="button"
          className="ui-button ui-button--primary min-h-[var(--touch-target)] flex-1"
          onClick={() => onSave(question.id, draft.trim())}
        >
          {labels.save}
        </button>
        <button
          type="button"
          className="ui-button ui-button--secondary min-h-[var(--touch-target)]"
          onClick={() => {
            setDraft("");
            onSave(question.id, "");
          }}
        >
          {labels.clear}
        </button>
      </div>
    </section>
  );
}

export function AnswerSheet({
  question,
  labels,
  onSave,
}: {
  question: WizardQuestion | null;
  labels: AnswerSheetLabels;
  onSave: (id: number, answer: string) => void;
}) {
  if (!question) {
    return (
      <div
        role="status"
        className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-[var(--space-4)] text-[var(--font-size-sm)] text-[var(--color-text-muted)]"
      >
        {labels.empty}
      </div>
    );
  }

  return (
    <AnswerSheetEditor
      key={question.id}
      question={question}
      labels={labels}
      onSave={onSave}
    />
  );
}
