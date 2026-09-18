"use client";

import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import type { DecisionSummarySnapshot } from "@/lib/share-card";
import {
  buildCardImageModel,
  type CardImageDocumentLabels,
  type CardImageExportUiLabels,
  type CardImagePhotoSource,
} from "@/lib/card-image";

type ExportState =
  | { status: "idle" }
  | { status: "preparing"; completed: number; total: number }
  | { status: "generating" }
  | { status: "ready" }
  | { status: "success" }
  | { status: "error"; message: string };

const RENDER_TIMEOUT_MS = 60_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("CARD_IMAGE_RENDER_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
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

export function CardImageExportButton({
  snapshot,
  photoSources,
  locale,
  documentLabels,
  uiLabels,
}: {
  snapshot: DecisionSummarySnapshot;
  photoSources: CardImagePhotoSource[];
  locale: string;
  documentLabels: CardImageDocumentLabels;
  uiLabels: CardImageExportUiLabels;
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

  async function exportImage() {
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

    setState({ status: "preparing", completed: 0, total: 0 });
    try {
      const [{ prepareCardImagePhotos }, { renderCardImageJpeg }] = await Promise.all([
        import("@/lib/card-image/images.client"),
        import("@/lib/card-image/render.client"),
      ]);
      const publicModel = buildCardImageModel(snapshot, []);
      const total = publicModel.snapshot.photos.length;
      const photos = await prepareCardImagePhotos(
        publicModel.snapshot,
        photoSources,
        (completed) => {
          if (mounted.current) {
            setState({ status: "preparing", completed, total });
          }
        },
      );
      if (mounted.current) setState({ status: "generating" });
      const model = buildCardImageModel(publicModel.snapshot, photos);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const blob = await withTimeout(
        renderCardImageJpeg(model, documentLabels, locale),
        RENDER_TIMEOUT_MS,
      );
      const file = new File([blob], model.fileName, { type: "image/jpeg" });
      const canShareFile =
        iosSafari &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFile) {
        pendingFile.current = file;
        if (mounted.current) setState({ status: "ready" });
        return;
      }
      downloadBlob(blob, model.fileName);
      if (mounted.current) setState({ status: "success" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (mounted.current) setState({ status: "idle" });
        return;
      }
      const isImageError =
        error instanceof Error && error.message === "CARD_IMAGE_PREPARATION_FAILED";
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
        onClick={() => void exportImage()}
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
