"use client";

import Link from "next/link";
import { Check, Copy, Share2 } from "lucide-react";
import { SheetCloseButton } from "@/components/viewing-chat/shell/SheetCloseButton";
import { canNativeShareUrl } from "@/lib/share-or-copy";

export function ShareReportDialog({
  open,
  labels,
  url,
  feedback,
  busy,
  error,
  onClose,
  onCopy,
  onCreate,
}: {
  open: boolean;
  labels: {
    title: string;
    copied: string;
    copy: string;
    share?: string;
    shared?: string;
    copyFailed: string;
    hubGuide: string;
    hubCta: string;
    close: string;
    preparing?: string;
    create?: string;
  };
  url: string | null;
  feedback: "shared" | "copied" | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCopy: () => void;
  /** Create or reopen the general share link. */
  onCreate?: () => void;
}) {
  if (!open) return null;

  const showCreate = Boolean(onCreate) && !url && !busy;
  const nativeShare = canNativeShareUrl();
  const actionLabel = nativeShare ? labels.share || labels.copy : labels.copy;
  const doneLabel =
    feedback === "shared"
      ? labels.shared || labels.copied
      : labels.copied;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-report-dialog-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-start gap-2">
          <h2
            id="share-report-dialog-title"
            className="min-w-0 flex-1 pt-2 text-[16px] font-bold"
          >
            {labels.title}
          </h2>
          <SheetCloseButton label={labels.close} onClick={onClose} />
        </div>
        {showCreate ? (
          <button
            type="button"
            onClick={() => onCreate?.()}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-black px-4 text-[13px] font-bold text-white"
          >
            {labels.create || "Create"}
          </button>
        ) : null}
        {busy ? (
          <p className="mt-3 text-[13px] font-semibold text-[#6B7280]">
            {labels.preparing || "…"}
          </p>
        ) : null}
        {!busy && error ? (
          <p className="mt-3 text-[13px] font-semibold text-[#991B1B]" role="alert">
            {error === "COPY_FAILED" ? labels.copyFailed : error}
          </p>
        ) : null}
        {url ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#FAF7F3] px-3 py-2">
            <p className="min-w-0 flex-1 break-all text-[12px] text-[#374151]">{url}</p>
            <button
              type="button"
              onClick={onCopy}
              aria-label={feedback ? doneLabel : actionLabel}
              title={feedback ? doneLabel : actionLabel}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#1A1A1A] hover:bg-black/5 active:bg-black/10"
            >
              {feedback ? (
                <Check className="h-4 w-4 text-[#065F46]" aria-hidden />
              ) : nativeShare ? (
                <Share2 className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        ) : null}
        {!busy && feedback ? (
          <p className="mt-2 text-[12px] font-semibold text-[#065F46]" role="status">
            {doneLabel}
          </p>
        ) : null}
        <p className="mt-3 text-[13px] leading-relaxed text-[#4B5563]">{labels.hubGuide}</p>
        <div className="mt-4">
          <Link
            href="/shares"
            onClick={onClose}
            className="inline-flex rounded-full bg-black px-3 py-2 text-[12px] font-bold text-white"
          >
            {labels.hubCta}
          </Link>
        </div>
      </div>
    </div>
  );
}
