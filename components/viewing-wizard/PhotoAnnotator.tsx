"use client";

import { useEffect, useId, useRef } from "react";
import type { PhotoTagId } from "@/lib/field-capture";

export function PhotoAnnotator({
  open,
  title,
  tagLabel,
  noteLabel,
  notePlaceholder,
  saveLabel,
  cancelLabel,
  tagOptions,
  tagId,
  note,
  previewUrl,
  onTagChange,
  onNoteChange,
  onSave,
  onCancel,
}: {
  open: boolean;
  title: string;
  tagLabel: string;
  noteLabel: string;
  notePlaceholder: string;
  saveLabel: string;
  cancelLabel: string;
  tagOptions: Array<{ id: PhotoTagId; label: string }>;
  tagId: PhotoTagId;
  note: string;
  previewUrl?: string;
  onTagChange: (id: PhotoTagId) => void;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    node?.querySelector<HTMLElement>("button, textarea, [href], input, select")?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-center bg-black/45 backdrop-blur-[2px] p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[420px] my-auto bg-white rounded-[24px] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)] max-h-[90vh] overflow-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={titleId} className="text-[17px] font-bold">
          {title}
        </h3>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="mt-3 w-full max-h-40 object-cover rounded-2xl bg-[#F5F3F0]"
          />
        ) : null}

        <fieldset className="mt-4">
          <legend className="text-[12px] font-bold text-[#374151]">{tagLabel}</legend>
          <div
            className="mt-2 flex flex-wrap gap-2"
            role="radiogroup"
            aria-label={tagLabel}
          >
            {tagOptions.map((option) => {
              const selected = option.id === tagId;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onTagChange(option.id)}
                  className={`min-h-11 px-3 rounded-full text-[12px] font-bold border transition ${
                    selected
                      ? "bg-black text-white border-black"
                      : "bg-[#F8F4EF] text-[#374151] border-black/10"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-4 block">
          <span className="text-[12px] font-bold text-[#374151]">{noteLabel}</span>
          <textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            rows={2}
            maxLength={200}
            placeholder={notePlaceholder}
            className="mt-1.5 w-full px-3 py-2.5 rounded-2xl bg-[#F8F4EF] border border-black/5 text-[14px] outline-none focus:ring-2 focus:ring-black/15 resize-none"
          />
        </label>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-12 flex-1 rounded-full bg-white border border-black/10 text-[14px] font-bold"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onSave}
            className="h-12 flex-[1.4] rounded-full bg-black text-white text-[14px] font-bold"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
