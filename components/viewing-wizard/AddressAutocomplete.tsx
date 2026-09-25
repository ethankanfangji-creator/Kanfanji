"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { useLocale } from "@/components/I18nProvider";
import type { AddressSuggestion } from "@/lib/address-suggest";

export type AddressAutocompleteCopy = {
  placeholder: string;
  loading: string;
  empty: string;
  error: string;
  listLabel: string;
  /** Magnifier / Enter search button label */
  search?: string;
};

type SuggestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; items: AddressSuggestion[] }
  | { status: "empty" }
  | { status: "error"; message: string };

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  onCommit,
  disabled,
  copy,
  confirmed,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  /** Enter / search icon with no highlighted suggestion — commit free-typed address. */
  onCommit?: (value: string) => void;
  disabled?: boolean;
  copy: AddressAutocompleteCopy;
  confirmed?: boolean;
}) {
  const listId = useId();
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [suggest, setSuggest] = useState<SuggestState>({ status: "idle" });
  const requestIdRef = useRef(0);

  useEffect(() => {
    const q = value.trim();
    if (confirmed || q.length < 3) {
      setSuggest({ status: "idle" });
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const requestId = ++requestIdRef.current;
      setSuggest({ status: "loading" });
      setOpen(true);
      void fetch(
        `/api/address-suggest?q=${encodeURIComponent(q)}&locale=${encodeURIComponent(locale)}`,
        {
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          if (requestId !== requestIdRef.current) return;
          if (!response.ok) {
            setSuggest({ status: "error", message: copy.error });
            return;
          }
          const payload = (await response.json()) as { suggestions?: AddressSuggestion[] };
          const items = Array.isArray(payload.suggestions) ? payload.suggestions : [];
          if (items.length === 0) {
            setSuggest({ status: "empty" });
          } else {
            setSuggest({ status: "ready", items });
            setHighlight(0);
          }
        })
        .catch((error: unknown) => {
          if (requestId !== requestIdRef.current) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSuggest({ status: "error", message: copy.error });
        });
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value, confirmed, copy.error, locale]);

  const items = suggest.status === "ready" ? suggest.items : [];

  function selectIndex(index: number) {
    const item = items[index];
    if (!item) return;
    onSelect(item);
    setOpen(false);
    setSuggest({ status: "idle" });
  }

  function commitSearch() {
    if (disabled) return;
    if (open && items[highlight]) {
      selectIndex(highlight);
      return;
    }
    const trimmed = value.trim();
    if (onCommit && trimmed) {
      setOpen(false);
      onCommit(trimmed);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitSearch();
      return;
    }
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp") && items.length) {
      setOpen(true);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => (items.length ? (current + 1) % items.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) =>
        items.length ? (current - 1 + items.length) % items.length : 0,
      );
    }
  }

  const showList =
    open &&
    !confirmed &&
    (suggest.status === "loading" ||
      suggest.status === "ready" ||
      suggest.status === "empty" ||
      suggest.status === "error");

  const canSearch = Boolean(value.trim()) && !disabled;
  const searchLabel = copy.search || "Search";

  return (
    <div className="mt-[var(--space-2)] min-w-0 flex-1">
      <div className="relative">
        <MapPin
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
        />
        <input
          ref={inputRef}
          id="setup-address"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && items[highlight] ? `${listId}-option-${highlight}` : undefined
          }
          required
          disabled={disabled}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (!confirmed && value.trim().length >= 3) setOpen(true);
          }}
          onBlur={() => {
            // Delay so option / search click can register.
            window.setTimeout(() => setOpen(false), 150);
          }}
          placeholder={copy.placeholder}
          autoComplete="off"
          maxLength={200}
          className="w-full min-w-0 max-w-full min-h-[var(--touch-target)] box-border rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] pl-9 pr-12 text-[16px] font-medium text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus)]/20 sm:text-[var(--font-size-sm)] disabled:opacity-60"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={!canSearch}
          aria-label={searchLabel}
          title={searchLabel}
          onMouseDown={(event) => {
            event.preventDefault();
            commitSearch();
          }}
          className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#374151] transition-colors hover:bg-black/5 disabled:opacity-40"
        >
          <Search className="h-4 w-4" strokeWidth={2.25} />
        </button>

        {showList ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={copy.listLabel}
            className="absolute z-30 mt-1.5 max-h-56 w-full overflow-auto rounded-xl border border-black/8 bg-white py-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.1)]"
          >
            {suggest.status === "loading" ? (
              <li
                role="presentation"
                className="flex items-center gap-2 px-3 py-3 text-[13px] text-[#6B7280]"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {copy.loading}
              </li>
            ) : null}
            {suggest.status === "empty" ? (
              <li role="presentation" className="px-3 py-3 text-[13px] text-[#6B7280]">
                {copy.empty}
              </li>
            ) : null}
            {suggest.status === "error" ? (
              <li role="alert" className="px-3 py-3 text-[13px] text-[#991B1B]">
                {suggest.message}
              </li>
            ) : null}
            {items.map((item, index) => {
              const title = item.title?.trim() || item.label;
              const secondary =
                item.secondary?.trim() && item.secondary.trim() !== title
                  ? item.secondary.trim()
                  : null;
              return (
              <li
                key={item.id}
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={highlight === index}
                className={`cursor-pointer px-3 py-2 text-left ${
                  highlight === index ? "bg-[#111] text-white" : "text-[#1A1A1A] hover:bg-[#F5F3F0]"
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectIndex(index);
                }}
                onMouseEnter={() => setHighlight(index)}
              >
                <p className="truncate text-[13px] font-medium leading-snug">{title}</p>
                {secondary ? (
                  <p
                    className={`truncate text-[11px] leading-snug ${
                      highlight === index ? "text-white/70" : "text-[#6B7280]"
                    }`}
                  >
                    {secondary}
                  </p>
                ) : null}
              </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
