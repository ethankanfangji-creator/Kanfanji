"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Camera, FileText, Mic, Video, X } from "lucide-react";
import type { WizardQuestion } from "@/lib/viewing-wizard/questions";

export type AnswerMethod = "audio" | "photo" | "video" | "note";

export type AnswerMethodSheetLabels = {
  title: string;
  description: string;
  audio: string;
  photo: string;
  video: string;
  note: string;
  close: string;
  noteTitle: string;
  notePlaceholder: string;
  noteSave: string;
  noteCancel: string;
};

function AnswerMethodSheetPanel({
  question,
  labels,
  onClose,
  onSelectMethod,
  onSaveNote,
}: {
  question: WizardQuestion;
  labels: AnswerMethodSheetLabels;
  onClose: () => void;
  onSelectMethod: (method: Exclude<AnswerMethod, "note">) => void;
  onSaveNote: (questionId: number, answer: string) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"methods" | "note">("methods");
  const [noteDraft, setNoteDraft] = useState(question.answer ?? "");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget =
      panelRef.current?.querySelector<HTMLElement>("button, textarea") ?? panelRef.current;
    focusTarget?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const methods: Array<{
    method: Exclude<AnswerMethod, "note"> | "note";
    label: string;
    icon: ReactNode;
  }> = [
    { method: "audio", label: labels.audio, icon: <Mic className="h-5 w-5" aria-hidden /> },
    { method: "photo", label: labels.photo, icon: <Camera className="h-5 w-5" aria-hidden /> },
    { method: "video", label: labels.video, icon: <Video className="h-5 w-5" aria-hidden /> },
    { method: "note", label: labels.note, icon: <FileText className="h-5 w-5" aria-hidden /> },
  ];

  return (
    <div
      className="answer-method-sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="answer-method-sheet-panel"
      >
        <div className="flex items-start justify-between gap-[var(--space-3)]">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[var(--font-size-md)] font-extrabold text-[var(--color-text)]">
              {mode === "note" ? labels.noteTitle : labels.title}
            </h2>
            <p
              id={descriptionId}
              className="mt-[var(--space-1)] text-[var(--font-size-sm)] leading-[1.45] text-[var(--color-text-muted)]"
            >
              {mode === "note" ? question.text : labels.description}
            </p>
          </div>
          <button
            type="button"
            className="ui-button ui-button--secondary h-12 w-12 shrink-0 !min-h-12 !px-0"
            aria-label={labels.close}
            onClick={onClose}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {mode === "methods" ? (
          <div className="mt-[var(--space-4)] grid gap-[var(--space-2)]">
            {methods.map((item) => (
              <button
                key={item.method}
                type="button"
                className="answer-method-sheet-option"
                onClick={() => {
                  if (item.method === "note") {
                    setMode("note");
                    return;
                  }
                  onSelectMethod(item.method);
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-[var(--space-4)] space-y-[var(--space-3)]">
            <label className="block">
              <span className="sr-only">{labels.notePlaceholder}</span>
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                rows={5}
                placeholder={labels.notePlaceholder}
                className="w-full resize-none rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-[var(--space-4)] py-[var(--space-3)] text-[16px] text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus)]/20"
              />
            </label>
            <div className="flex flex-col gap-[var(--space-2)] sm:flex-row">
              <button
                type="button"
                className="ui-button ui-button--primary min-h-12 flex-1"
                onClick={() => onSaveNote(question.id, noteDraft.trim())}
              >
                {labels.noteSave}
              </button>
              <button
                type="button"
                className="ui-button ui-button--secondary min-h-12"
                onClick={() => setMode("methods")}
              >
                {labels.noteCancel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function AnswerMethodSheet({
  open,
  question,
  labels,
  onClose,
  onSelectMethod,
  onSaveNote,
}: {
  open: boolean;
  question: WizardQuestion | null;
  labels: AnswerMethodSheetLabels;
  onClose: () => void;
  onSelectMethod: (method: Exclude<AnswerMethod, "note">) => void;
  onSaveNote: (questionId: number, answer: string) => void;
}) {
  const [portalNode] = useState<HTMLDivElement | null>(() => {
    if (typeof document === "undefined") return null;
    const node = document.createElement("div");
    node.dataset.answerSheetPortal = "";
    return node;
  });

  useEffect(() => {
    if (!portalNode) return;
    document.body.appendChild(portalNode);
    return () => portalNode.remove();
  }, [portalNode]);

  if (!open || !portalNode || !question) return null;

  return createPortal(
    <AnswerMethodSheetPanel
      key={question.id}
      question={question}
      labels={labels}
      onClose={onClose}
      onSelectMethod={onSelectMethod}
      onSaveNote={onSaveNote}
    />,
    portalNode,
  );
}
