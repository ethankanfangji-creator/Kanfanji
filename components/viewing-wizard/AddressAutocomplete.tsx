"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import type { AddressSuggestion } from "@/lib/address-suggest";

export type AddressAutocompleteCopy = {
  placeholder: string;
  loading: string;
  empty: string;
  error: string;
  listLabel: string;
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
  disabled,
  copy,
  confirmed,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  disabled?: boolean;
  copy: AddressAutocompleteCopy;
  confirmed?: boolean;
}) {
  const listId = useId();
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
      void fetch(`/api/address-suggest?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
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
  }, [value, confirmed, copy.error]);

  const items = suggest.status === "ready" ? suggest.items : [];

  function selectIndex(index: number) {
    const item = items[index];
    if (!item) return;
    onSelect(item);
    setOpen(false);
    setSuggest({ status: "idle" });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
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
    } else if (event.key === "Enter") {
      if (items[highlight]) {
        event.preventDefault();
        selectIndex(highlight);
      }
    }
  }

  const showList =
    open &&
    !confirmed &&
    (suggest.status === "loading" ||
      suggest.status === "ready" ||
      suggest.status === "empty" ||
      suggest.status === "error");

  return (
    <div className="relative min-w-0 flex-1">
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
          // Delay so option click can register.
          window.setTimeout(() => setOpen(false), 150);
        }}
        placeholder={copy.placeholder}
        autoComplete="off"
        maxLength={200}
        className="mt-[var(--space-2)] w-full min-w-0 max-w-full min-h-[var(--touch-target)] box-border rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] pl-9 pr-3 text-[16px] font-medium text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus)]/20 sm:text-[var(--font-size-sm)] disabled:opacity-60"
      />

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={copy.listLabel}
          className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-[16px] border border-black/10 bg-white py-1 shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
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
          {items.map((item, index) => (
            <li
              key={item.id}
              id={`${listId}-option-${index}`}
              role="option"
              aria-selected={highlight === index}
              className={`cursor-pointer px-3 py-2.5 text-left ${
                highlight === index ? "bg-[#111] text-white" : "text-[#1A1A1A] hover:bg-[#F5F3F0]"
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                selectIndex(index);
              }}
              onMouseEnter={() => setHighlight(index)}
            >
              <p className="text-[13px] font-semibold leading-snug">{item.label}</p>
              {item.secondary ? (
                <p
                  className={`mt-0.5 text-[11px] ${
                    highlight === index ? "text-white/75" : "text-[#6B7280]"
                  }`}
                >
                  {item.secondary}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
