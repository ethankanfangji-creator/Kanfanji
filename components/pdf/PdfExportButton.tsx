"use client";

import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import type { DecisionSummarySnapshot } from "@/lib/share-card";
import {
  buildPdfSummary,
  type PdfDocumentLabels,
  type PdfExportUiLabels,
  type PdfPhotoSource,
} from "@/lib/pdf-export";

type ExportState =
  | { status: "idle" }
  | { status: "preparing"; completed: number; total: number }
  | { status: "generating" }
  | { status: "ready" }
  | { status: "success" }
  | { status: "error"; message: string };

const PDF_RENDER_TIMEOUT_MS = 60_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("PDF_RENDER_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function PdfExportButton({
  snapshot,
  photoSources,
  locale,
  documentLabels,
  uiLabels,
}: {
  snapshot: DecisionSummarySnapshot;
  photoSources: PdfPhotoSource[];
  locale: string;
  documentLabels: PdfDocumentLabels;
  uiLabels: PdfExportUiLabels;
}) {
  const [state, setState] = useState<ExportState>({ status: "idle" });
  const mounted = useRef(true);
  const pendingFile = useRef<File | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const busy = state.status === "preparing" || state.status === "generating";
  const buttonLabel =
    state.status === "preparing"
      ? `${uiLabels.preparingImages}${
          state.total ? ` ${state.completed}/${state.total}` : ""
        }`
      : state.status === "generating"
        ? uiLabels.generating
        : state.status === "ready"
          ? uiLabels.openFallback
          : state.status === "error"
            ? uiLabels.retry
            : uiLabels.button;

  async function exportPdf() {
    const iosSafari = isIosSafari();
    const preparedFile = pendingFile.current;
    if (preparedFile) {
      try {
        if (
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [preparedFile] })
        ) {
          await navigator.share({
            title: uiLabels.fileShareTitle,
            files: [preparedFile],
          });
        } else {
          downloadBlob(preparedFile, preparedFile.name);
        }
        pendingFile.current = null;
        if (mounted.current) setState({ status: "success" });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          pendingFile.current = null;
          if (mounted.current) setState({ status: "error", message: uiLabels.error });
        }
      }
      return;
    }
    const fileShareLikelySupported =
      iosSafari &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({
        files: [new File([""], "summary.pdf", { type: "application/pdf" })],
      });
    const popup =
      iosSafari && !fileShareLikelySupported ? window.open("", "_blank") : null;
    setState({ status: "preparing", completed: 0, total: 0 });
    try {
      const [{ preparePdfPhotos }, { ViewingSummaryPdfDocument }, renderer] =
        await Promise.all([
          import("@/lib/pdf-export/images.client"),
          import("./ViewingSummaryPdfDocument"),
          import("@react-pdf/renderer"),
        ]);
      const publicSnapshot = buildPdfSummary(snapshot, []).snapshot;
      const total = publicSnapshot.photos.length;
      const photos = await preparePdfPhotos(
        publicSnapshot,
        photoSources,
        (completed) => {
          if (mounted.current) {
            setState({ status: "preparing", completed, total });
          }
        },
      );
      if (mounted.current) setState({ status: "generating" });
      const model = buildPdfSummary(publicSnapshot, photos);
      const document = (
        <ViewingSummaryPdfDocument
          model={model}
          labels={documentLabels}
          locale={locale}
        />
      );
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const blob = await withTimeout(
        renderer.pdf(document).toBlob(),
        PDF_RENDER_TIMEOUT_MS,
      );
      const file = new File([blob], model.fileName, { type: "application/pdf" });
      const canShareFile =
        iosSafari &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFile) {
        popup?.close();
        pendingFile.current = file;
        if (mounted.current) setState({ status: "ready" });
        return;
      } else if (popup) {
        const url = URL.createObjectURL(blob);
        popup.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
      } else {
        downloadBlob(blob, model.fileName);
      }
      if (mounted.current) setState({ status: "success" });
    } catch (error) {
      popup?.close();
      if (error instanceof DOMException && error.name === "AbortError") {
        if (mounted.current) setState({ status: "idle" });
        return;
      }
      const isImageError =
        error instanceof Error && error.message === "PDF_IMAGE_PREPARATION_FAILED";
      if (mounted.current) {
        setState({
          status: "error",
          message: isImageError ? uiLabels.imageError : uiLabels.error,
        });
      }
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void exportPdf()}
        className="w-full h-[44px] rounded-full bg-[#EEF2FF] border border-[#C7D2FE] text-[#3730A3] text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-55"
      >
        {busy ? (
          <LoaderCircle className="w-4 h-4 animate-spin" />
        ) : state.status === "error" ? (
          <RefreshCw className="w-4 h-4" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {buttonLabel}
      </button>
      {state.status === "error" ? (
        <p role="alert" className="text-[11px] text-[#991B1B] text-center">
          {state.message}
        </p>
      ) : state.status === "ready" || state.status === "success" ? (
        <p role="status" className="text-[11px] text-[#166534] text-center">
          {uiLabels.success}
        </p>
      ) : null}
    </div>
  );
}

