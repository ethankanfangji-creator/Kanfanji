"use client";

import { Pin, Trash2, X } from "lucide-react";
import type { ViewingChatThread } from "@/lib/viewing-chat/types";
import { shortenAddressLabel } from "@/lib/shorten-address";

/**
 * Mobile history drawer — overlay, default closed. Does not permanently
 * consume horizontal space the way the desktop IconRail does.
 */
export function MobileHistoryDrawer({
  open,
  threads,
  activeId,
  onClose,
  onSelectThread,
  onDeleteThread,
  onTogglePinThread,
  onStartNew,
  labels,
}: {
  open: boolean;
  threads: ViewingChatThread[];
  activeId: string | null;
  onClose: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onTogglePinThread: (id: string) => void;
  /** Empty-state CTA — leave history and open address setup. */
  onStartNew?: () => void;
  labels: {
    title: string;
    empty: string;
    close: string;
    pin: string;
    unpin: string;
    delete: string;
    startNew?: string;
  };
}) {
  if (!open) return null;

  const recent = threads.slice(0, 40);

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] md:hidden" role="dialog" aria-modal="true" aria-label={labels.title}>
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label={labels.close}
        onClick={onClose}
      />
      <aside
        className="absolute inset-y-0 left-0 flex w-[min(100%,20rem)] flex-col bg-white shadow-2xl"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/8 px-3 pb-3">
          <h2 className="text-[15px] font-bold text-[#1A1A1A]">{labels.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full text-[#4B5563] hover:bg-black/5"
            aria-label={labels.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          {recent.length === 0 ? (
            <li className="px-4 py-10 text-center">
              <p className="text-[13px] text-[#6B7280]">{labels.empty}</p>
              {onStartNew && labels.startNew ? (
                <button
                  type="button"
                  onClick={onStartNew}
                  className="mt-4 inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-full bg-black px-5 text-[13px] font-bold text-white active:scale-[0.98]"
                >
                  {labels.startNew}
                </button>
              ) : null}
            </li>
          ) : (
            recent.map((thread) => {
              const active = thread.id === activeId;
              const preview =
                [...thread.messages]
                  .reverse()
                  .find((m) => m.transcript || m.text)?.transcript ||
                [...thread.messages].reverse().find((m) => m.text)?.text ||
                "";
              return (
                <li key={thread.id} className="border-b border-black/5">
                  <div className="flex items-stretch gap-1">
                    <button
                      type="button"
                      onClick={() => onSelectThread(thread.id)}
                      className={`min-h-[var(--touch-target)] min-w-0 flex-1 py-3 pl-4 pr-2 text-left touch-manipulation ${
                        active ? "bg-[#EFF6FF]" : "active:bg-[#FAF6F1]"
                      }`}
                    >
                      <p className="flex items-center gap-1 truncate text-[14px] font-bold text-[#1A1A1A]">
                        {thread.pinned ? (
                          <Pin
                            className="h-3.5 w-3.5 shrink-0 fill-current text-[#2563EB]"
                            aria-hidden
                          />
                        ) : null}
                        <span className="truncate" title={thread.address || undefined}>
                          {thread.address
                            ? shortenAddressLabel(
                                thread.normalizedAddress || thread.address,
                              )
                            : "—"}
                        </span>
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
                    <div className="flex shrink-0 flex-col justify-center gap-0.5 pr-2">
                      <button
                        type="button"
                        onClick={() => onTogglePinThread(thread.id)}
                        className={`flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full ${
                          thread.pinned
                            ? "text-[#2563EB]"
                            : "text-[#9CA3AF]"
                        }`}
                        aria-label={thread.pinned ? labels.unpin : labels.pin}
                      >
                        <Pin
                          className={`h-4 w-4 ${thread.pinned ? "fill-current" : ""}`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteThread(thread.id)}
                        className="flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] items-center justify-center rounded-full text-[#9CA3AF]"
                        aria-label={labels.delete}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </aside>
    </div>
  );
}
