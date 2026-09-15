"use client";

import type { SessionUiStatus } from "@/lib/sync";

type SyncUiMessages = {
  savedLocal: string;
  pending: string;
  syncing: string;
  synced: string;
  failed: string;
  conflict: string;
  retry: string;
};

export function SyncStatusBanner({
  status,
  messages,
  onRetry,
  busy,
}: {
  status: SessionUiStatus | null;
  messages: SyncUiMessages;
  onRetry?: () => void;
  busy?: boolean;
}) {
  if (!status) return null;

  const label =
    status.labelKey === "savedLocal"
      ? messages.savedLocal
      : status.labelKey === "pending"
        ? messages.pending
        : status.labelKey === "syncing"
          ? messages.syncing
          : status.labelKey === "synced"
            ? messages.synced
            : status.labelKey === "failed"
              ? messages.failed
              : messages.conflict;

  const tone =
    status.status === "failed" || status.status === "conflict"
      ? "bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]"
      : status.status === "synced"
        ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]"
        : status.status === "syncing"
          ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]"
          : "bg-[#F8F4EF] border-black/10 text-[#6B7280]";

  return (
    <div className={`mb-4 rounded-[18px] border p-3 text-[12px] leading-[1.45] ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">{label}</p>
          {status.errorMessage ? (
            <p className="mt-1 opacity-90">{status.errorMessage}</p>
          ) : null}
        </div>
        {status.canRetry && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="shrink-0 h-8 px-3 rounded-full bg-black text-white text-[11px] font-bold disabled:opacity-50"
          >
            {messages.retry}
          </button>
        ) : null}
      </div>
    </div>
  );
}
