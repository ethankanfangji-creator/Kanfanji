"use client";

import type { MediaPermissionStatus } from "@/lib/media-permissions";

export function MediaPermissionBanner({
  status,
  message,
  settingsHint,
  importLabel,
  onImport,
  onDismiss,
}: {
  status: MediaPermissionStatus;
  message: string;
  settingsHint: string;
  importLabel?: string;
  onImport?: () => void;
  onDismiss?: () => void;
}) {
  const showSettings =
    status === "denied" ||
    status === "blocked" ||
    status === "permission-revoked" ||
    status === "in-use";

  return (
    <div className="mt-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-[12px] text-[#991B1B] leading-[1.45]">
      <p className="font-bold">{message}</p>
      {showSettings ? <p className="mt-1.5 opacity-90">{settingsHint}</p> : null}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {onImport && importLabel ? (
          <button
            type="button"
            onClick={onImport}
            className="h-9 px-3 rounded-full bg-white border border-[#FECACA] text-[11px] font-bold"
          >
            {importLabel}
          </button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="h-9 px-3 rounded-full bg-transparent text-[11px] font-bold underline"
          >
            OK
          </button>
        ) : null}
      </div>
    </div>
  );
}
