"use client";

import Link from "next/link";

export function ShareReportDialog({
  open,
  labels,
  url,
  copied,
  busy,
  error,
  onClose,
}: {
  open: boolean;
  labels: {
    title: string;
    copied: string;
    copyFailed: string;
    hubGuide: string;
    hubCta: string;
    close: string;
    preparing?: string;
  };
  url: string | null;
  copied: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-report-dialog-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <h2 id="share-report-dialog-title" className="text-[16px] font-bold">
          {labels.title}
        </h2>
        {busy ? (
          <p className="mt-3 text-[13px] font-semibold text-[#6B7280]">
            {labels.preparing || "…"}
          </p>
        ) : null}
        {!busy && copied ? (
          <p className="mt-3 text-[13px] font-semibold text-[#065F46]" role="status">
            {labels.copied}
          </p>
        ) : null}
        {!busy && error ? (
          <p className="mt-3 text-[13px] font-semibold text-[#991B1B]" role="alert">
            {error === "COPY_FAILED" ? labels.copyFailed : error}
          </p>
        ) : null}
        {url ? (
          <p className="mt-3 break-all rounded-xl bg-[#FAF7F3] px-3 py-2 text-[12px] text-[#374151]">
            {url}
          </p>
        ) : null}
        <p className="mt-3 text-[13px] leading-relaxed text-[#4B5563]">{labels.hubGuide}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full border px-3 py-2 text-[12px] font-bold"
            onClick={onClose}
          >
            {labels.close}
          </button>
          <Link
            href="/shares"
            onClick={onClose}
            className="rounded-full bg-black px-3 py-2 text-[12px] font-bold text-white"
          >
            {labels.hubCta}
          </Link>
        </div>
      </div>
    </div>
  );
}
