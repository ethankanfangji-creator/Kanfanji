"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ViewingChatThread } from "@/lib/viewing-chat/types";
import { messageSearchHaystack } from "@/lib/viewing-chat/types";
import { shortenAddressLabel } from "@/lib/shorten-address";

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

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40">
      <button type="button" className="absolute inset-0" aria-label={labels.close} onClick={onClose} />
      <div
        className={`relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl ${
          railExpanded ? "ml-[240px]" : "ml-14"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-black/8 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[#6B7280]" />
          <h2 className="flex-1 text-[15px] font-bold">{labels.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5"
            aria-label={labels.close}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-black/8 px-4 py-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.placeholder}
            className="h-11 w-full rounded-full border border-black/10 bg-[#FAF6F1] px-4 text-[14px] outline-none focus:ring-2 focus:ring-[#2563EB]/20"
          />
        </div>
        <ul className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <li className="px-4 py-10 text-center text-[13px] text-[#6B7280]">{labels.empty}</li>
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
                        ? shortenAddressLabel(thread.normalizedAddress || thread.address)
                        : "—"}
                    </p>
                    {preview ? (
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-[#6B7280]">{preview}</p>
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
      </div>
    </div>
  );
}
