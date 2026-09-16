"use client";

import type { CaptureKind, MediaPermissionStatus } from "@/lib/media-permissions";

export type PermissionCopy = {
  titleMic: string;
  titleCamera: string;
  titlePhoto: string;
  bodyMic: string;
  bodyCamera: string;
  bodyPhoto: string;
  localNote: string;
  continue: string;
  cancel: string;
  importInstead: string;
  settingsHint: string;
  status: Record<MediaPermissionStatus, string>;
};

export function PermissionPreflight({
  kind,
  copy,
  status,
  busy,
  onContinue,
  onCancel,
  onImport,
}: {
  kind: CaptureKind;
  copy: PermissionCopy;
  status: MediaPermissionStatus | null;
  busy?: boolean;
  onContinue: () => void;
  onCancel: () => void;
  onImport?: () => void;
}) {
  const title =
    kind === "audio" ? copy.titleMic : kind === "video" ? copy.titleCamera : copy.titlePhoto;
  const body =
    kind === "audio" ? copy.bodyMic : kind === "video" ? copy.bodyCamera : copy.bodyPhoto;
  const blocking =
    status === "denied" ||
    status === "blocked" ||
    status === "unsupported" ||
    status === "in-use" ||
    status === "permission-revoked";

  return (
    <div className="fixed inset-0 z-[60] flex justify-center bg-black/40 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-[420px] my-auto bg-white rounded-[24px] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
        <h3 className="text-[17px] font-bold leading-snug">{title}</h3>
        <p className="mt-2 text-[13px] text-[#4B5563] leading-[1.5]">{body}</p>
        <p className="mt-3 text-[12px] text-[#6B7280] leading-[1.45] rounded-xl bg-[#F8F4EF] border border-black/5 px-3 py-2.5">
          {copy.localNote}
        </p>

        {status && status !== "prompt" && status !== "granted" ? (
          <div
            className={`mt-3 rounded-xl border px-3 py-2.5 text-[12px] leading-[1.45] ${
              blocking
                ? "bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]"
                : "bg-[#F8F4EF] border-black/5 text-[#374151]"
            }`}
          >
            <p className="font-bold">{copy.status[status]}</p>
            {blocking ? <p className="mt-1.5 opacity-90">{copy.settingsHint}</p> : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          {!blocking ? (
            <button
              type="button"
              disabled={busy}
              onClick={onContinue}
              className="h-12 rounded-full bg-black text-white text-[14px] font-bold active:scale-[0.98] disabled:opacity-50"
            >
              {copy.continue}
            </button>
          ) : null}
          {onImport ? (
            <button
              type="button"
              disabled={busy}
              onClick={onImport}
              className="h-12 rounded-full bg-[#F8FAFF] border border-[#DBEAFE] text-[#2563EB] text-[14px] font-bold active:scale-[0.98] disabled:opacity-50"
            >
              {copy.importInstead}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-12 rounded-full bg-white border border-black/10 text-[14px] font-bold active:scale-[0.98]"
          >
            {copy.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
