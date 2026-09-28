"use client";

import type { SyncState } from "@/lib/viewing-chat/cloud-sync";

export function SyncStatusPill({
  state,
  labels,
  loginHref,
  onRetry,
  onUpgrade,
}: {
  state: SyncState;
  labels: {
    local: string;
    synced: string;
    syncing: string;
    retry: string;
    blocked: string;
  };
  loginHref?: string;
  onRetry?: () => void;
  onUpgrade?: () => void;
}) {
  const className =
    "inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#6B7280]";
  if (state === "local_only") {
    return (
      <a href={loginHref || "/login"} className={className} aria-live="polite">
        {labels.local}
      </a>
    );
  }
  if (state === "failed") {
    return (
      <button type="button" className={className} aria-live="polite" onClick={onRetry}>
        {labels.retry}
      </button>
    );
  }
  if (state === "blocked_limit") {
    return (
      <button type="button" className={className} aria-live="polite" onClick={onUpgrade}>
        {labels.blocked}
      </button>
    );
  }
  return (
    <span className={className} aria-live="polite">
      {state === "syncing" ? labels.syncing : labels.synced}
    </span>
  );
}
