"use client";

import { useId, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { FieldChecklistItem } from "@/lib/field-capture";

export function FieldChecklistPanel({
  title,
  addLabel,
  addPlaceholder,
  notePlaceholder,
  items,
  onToggle,
  onNoteChange,
  onAddCustom,
}: {
  title: string;
  addLabel: string;
  addPlaceholder: string;
  notePlaceholder: string;
  items: FieldChecklistItem[];
  onToggle: (id: string) => void;
  onNoteChange: (id: string, note: string) => void;
  onAddCustom: (text: string) => void;
}) {
  const listId = useId();
  const [draft, setDraft] = useState("");

  function submitCustom() {
    const text = draft.trim();
    if (!text) return;
    onAddCustom(text);
    setDraft("");
  }

  return (
    <section
      className="bg-white rounded-[24px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-5 mb-4"
      aria-labelledby={listId}
    >
      <h2 id={listId} className="text-[12px] font-[800] tracking-widest">
        {title}
      </h2>
      <ul className="mt-3 space-y-2">
        {items
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-black/5 bg-[#FAF7F3] p-3"
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={item.checked}
                  aria-label={item.text}
                  onClick={() => onToggle(item.id)}
                  className={`mt-0.5 w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition ${
                    item.checked
                      ? "bg-[#166534] border-[#166534] text-white"
                      : "bg-white border-black/10 text-transparent"
                  }`}
                >
                  <Check className="w-5 h-5" aria-hidden />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold leading-[1.35] text-[#1A1A1A]">
                    {item.text}
                    {item.custom ? (
                      <span className="ml-2 text-[10px] font-bold text-[#6B7280]">CUSTOM</span>
                    ) : null}
                  </p>
                  <label className="block mt-2">
                    <span className="sr-only">{notePlaceholder}</span>
                    <input
                      type="text"
                      value={item.note}
                      onChange={(event) => onNoteChange(item.id, event.target.value)}
                      placeholder={notePlaceholder}
                      className="w-full h-11 px-3 rounded-xl bg-white border border-black/5 text-[13px] outline-none focus:ring-2 focus:ring-black/15"
                    />
                  </label>
                </div>
              </div>
            </li>
          ))}
      </ul>

      <div className="mt-3 flex gap-2">
        <label className="flex-1">
          <span className="sr-only">{addPlaceholder}</span>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitCustom();
              }
            }}
            placeholder={addPlaceholder}
            className="w-full h-12 px-4 rounded-full bg-[#F8F4EF] border border-black/5 text-[14px] outline-none focus:ring-2 focus:ring-black/15"
          />
        </label>
        <button
          type="button"
          onClick={submitCustom}
          className="h-12 min-w-12 px-4 rounded-full bg-black text-white inline-flex items-center justify-center gap-1 text-[13px] font-bold"
          aria-label={addLabel}
        >
          <Plus className="w-4 h-4" aria-hidden />
          {addLabel}
        </button>
      </div>
    </section>
  );
}
