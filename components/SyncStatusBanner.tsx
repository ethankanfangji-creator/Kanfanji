"use client";

import type { SessionUiStatus } from "@/lib/sync";
import { Banner } from "@/components/ui/primitives";

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
      ? "danger"
      : status.status === "synced"
        ? "success"
        : status.status === "syncing"
          ? "info"
          : "neutral";

  return (
    <Banner
      role="status"
      aria-live="polite"
      aria-atomic="true"
      tone={tone}
      className="mb-4 text-[12px]"
    >
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
            className="shrink-0 min-h-11 px-3 rounded-full bg-black text-white text-[12px] font-bold disabled:opacity-50"
          >
            {messages.retry}
          </button>
        ) : null}
      </div>
    </Banner>
  );
}
