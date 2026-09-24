"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ViewingChatThread } from "@/lib/viewing-chat/types";
import { messageSearchHaystack } from "@/lib/viewing-chat/types";
import { shortenAddressLabel } from "@/lib/shorten-address";
import { SheetCloseButton } from "@/components/viewing-chat/shell/SheetCloseButton";

export function HistorySearchPanel({
  threads,
  activeId,
  onSelect,
  onClose,
  labels,
  railExpanded,
}: {
  threads: ViewingChatThread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  labels: {
    title: string;
    placeholder: string;
    empty: string;
    noResults: string;
    close: string;
  };
  railExpanded?: boolean;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((thread) => {
      if (thread.address.toLowerCase().includes(q)) return true;
      return thread.messages.some((m) =>
        messageSearchHaystack(m).toLowerCase().includes(q),
      );
    });
  }, [threads, query]);

  const list = (
    <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {threads.length === 0 ? (
        <li className="px-4 py-10 text-center text-[13px] text-[#6B7280]">
          {labels.empty}
        </li>
      ) : results.length === 0 ? (
        <li className="px-4 py-10 text-center text-[13px] text-[#6B7280]">
          {labels.noResults}
        </li>
      ) : (
        results.map((thread) => {
          const active = thread.id === activeId;
          const preview =
            [...thread.messages]
              .reverse()
              .find((m) => m.transcript || m.text)?.transcript ||
            [...thread.messages].reverse().find((m) => m.text)?.text ||
            "";
          return (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => onSelect(thread.id)}
                className={`w-full border-b border-black/5 px-4 py-3.5 text-left ${
                  active ? "bg-[#EFF6FF]" : "hover:bg-[#FAF6F1]"
                }`}
              >
                <p
                  className="truncate text-[14px] font-bold"
                  title={thread.address || undefined}
                >
                  {thread.address
                    ? shortenAddressLabel(
                        thread.normalizedAddress || thread.address,
                      )
                    : "—"}
                </p>
                {preview ? (
                  <p className="mt-0.5 line-clamp-2 text-[12px] text-[#6B7280]">
                    {preview}
                  </p>
                ) : null}
                <p className="mt-1 text-[10px] text-[#9CA3AF]">
                  {new Date(thread.updatedAt).toLocaleString()}
                </p>
              </button>
            </li>
          );
        })
      )}
    </ul>
  );

  const searchField = (
    <input
      autoFocus
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder={labels.placeholder}
      className="h-11 w-full rounded-full border border-black/10 bg-[#FAF6F1] px-4 text-[14px] outline-none focus:ring-2 focus:ring-[#2563EB]/20"
    />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-stretch"
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label={labels.close}
        onClick={onClose}
      />
      <div
        className={`relative z-10 flex h-[90svh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] border border-black/8 bg-white shadow-2xl md:ml-14 md:h-full md:max-h-none md:rounded-none md:border-0 ${
          railExpanded ? "md:ml-[240px]" : ""
        }`}
        style={{
          paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-black/15 md:hidden" aria-hidden />
        <div className="flex shrink-0 items-center gap-2 border-b border-black/8 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[#6B7280]" />
          <h2 className="flex-1 text-[15px] font-bold">{labels.title}</h2>
          <SheetCloseButton label={labels.close} onClick={onClose} />
        </div>
        <div className="shrink-0 border-b border-black/8 px-4 py-3">{searchField}</div>
        {list}
      </div>
    </div>
  );
}
