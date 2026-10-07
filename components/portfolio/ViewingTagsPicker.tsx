"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus, Tag, X } from "lucide-react";
import {
  VIEWING_TAG_MAX_CHARS,
  VIEWING_TAGS_MAX,
  addViewingTag,
  coerceViewingTags,
  isSuggestionTagId,
  normalizeTagKey,
  removeViewingTag,
  tagsInclude,
  type ViewingTagSuggestionId,
} from "@/lib/portfolio";

export type ViewingTagsPickerLabels = {
  label: string;
  placeholder: string;
  frequent: string;
  addAria: string;
};

export type ViewingTagDisplayLabels = {
  liked: string;
  shortlist: string;
  passed: string;
  revisit: string;
};

function suggestionLabel(id: ViewingTagSuggestionId, labels: ViewingTagDisplayLabels): string {
  switch (id) {
    case "liked":
      return labels.liked;
    case "shortlist":
      return labels.shortlist;
    case "passed":
      return labels.passed;
    case "revisit":
      return labels.revisit;
  }
}

/** Localize legacy suggestion ids for list/card display. */
export function displayViewingTag(tag: string, labels: ViewingTagDisplayLabels): string {
  if (isSuggestionTagId(tag)) return suggestionLabel(tag, labels);
  return tag;
}

export function ViewingTagsPicker({
  value,
  labels,
  onChange,
  frequentTags = [],
  displayLabels,
  compact,
}: {
  value: string[] | null | undefined;
  labels: ViewingTagsPickerLabels;
  onChange: (next: string[]) => void;
  /** Cross-viewing frequent tags for the input dropdown. */
  frequentTags?: readonly string[];
  displayLabels?: ViewingTagDisplayLabels;
  compact?: boolean;
}) {
  const tags = coerceViewingTags(value);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const listboxId = useId();

  const availableFrequent = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const needle = normalizeTagKey(draft);
    for (const raw of frequentTags) {
      const tag = coerceViewingTags([raw])[0];
      if (!tag) continue;
      const key = normalizeTagKey(tag);
      if (seen.has(key) || tagsInclude(tags, tag)) continue;
      const shown = displayLabels ? displayViewingTag(tag, displayLabels) : tag;
      if (needle && !normalizeTagKey(tag).includes(needle) && !normalizeTagKey(shown).includes(needle)) {
        continue;
      }
      seen.add(key);
      out.push(tag);
      if (out.length >= 12) break;
    }
    return out;
  }, [displayLabels, draft, frequentTags, tags]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setDraft("");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setDraft("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  function labelFor(tag: string): string {
    return displayLabels ? displayViewingTag(tag, displayLabels) : tag;
  }

  function commitDraft() {
    if (!draft.trim() || tags.length >= VIEWING_TAGS_MAX) return;
    onChange(addViewingTag(tags, draft));
    setDraft("");
  }

  function pickFrequent(tag: string) {
    if (tags.length >= VIEWING_TAGS_MAX) return;
    onChange(addViewingTag(tags, tag));
    setDraft("");
  }

  function collapse() {
    setOpen(false);
    setDraft("");
  }

  const atCap = tags.length >= VIEWING_TAGS_MAX;
  const showDropdown = open && availableFrequent.length > 0;

  return (
    <div
      ref={rootRef}
      className={compact ? "space-y-2" : "space-y-2.5"}
      role="group"
      aria-label={labels.label}
    >
      <div className="flex min-h-8 items-center gap-2">
        <p
          className={`shrink-0 font-bold tracking-wide text-[#1A1A1A] ${
            compact ? "text-[12px]" : "text-[13px]"
          }`}
        >
          {labels.label}
        </p>

        {open ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Tag
                className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-[#9CA3AF]"
                aria-hidden
              />
              <input
                id={fieldId}
                ref={inputRef}
                value={draft}
                maxLength={VIEWING_TAG_MAX_CHARS}
                disabled={atCap}
                role="combobox"
                aria-expanded={showDropdown}
                aria-controls={listboxId}
                aria-autocomplete="list"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitDraft();
                  }
                }}
                placeholder={labels.placeholder}
                className={`h-8 w-full border border-black/10 bg-white py-0 pl-8 pr-3 text-[12px] outline-none transition focus:border-black/25 disabled:opacity-50 ${
                  showDropdown ? "rounded-t-2xl rounded-b-none border-b-transparent" : "rounded-full"
                }`}
              />

              {showDropdown ? (
                <div
                  id={listboxId}
                  role="listbox"
                  aria-label={labels.frequent}
                  className="absolute left-0 right-0 top-full z-20 max-h-48 overflow-y-auto rounded-b-2xl border border-t-0 border-black/10 bg-white py-1 shadow-[0_8px_20px_rgba(0,0,0,0.06)]"
                >
                  <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold tracking-wide text-[#9CA3AF]">
                    {labels.frequent}
                  </p>
                  <ul>
                    {availableFrequent.map((tag) => (
                      <li key={tag}>
                        <button
                          type="button"
                          role="option"
                          disabled={atCap}
                          onClick={() => pickFrequent(tag)}
                          className="flex w-full items-center px-3 py-2 text-left text-[12px] font-medium text-[#374151] touch-manipulation hover:bg-black/[0.04] disabled:opacity-40"
                        >
                          {labelFor(tag)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              aria-label={labels.addAria}
              aria-expanded={true}
              onClick={collapse}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#6B7280] touch-manipulation hover:bg-black/[0.05] hover:text-[#1A1A1A]"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={labels.addAria}
            aria-expanded={false}
            aria-controls={fieldId}
            disabled={atCap}
            onClick={() => setOpen(true)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white/70 text-[#6B7280] touch-manipulation transition hover:border-black/20 hover:bg-white hover:text-[#1A1A1A] disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {tags.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                onClick={() => onChange(removeViewingTag(tags, tag))}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-black/[0.06] px-2.5 py-1 text-[11px] font-semibold text-[#374151] touch-manipulation transition hover:bg-black/10"
                aria-label={`${labels.label}: ${labelFor(tag)}`}
              >
                <span className="truncate">{labelFor(tag)}</span>
                <X className="h-3 w-3 shrink-0 text-[#9CA3AF]" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
