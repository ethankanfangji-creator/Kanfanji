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

function snapshotFingerprint(
  snapshot: DecisionSummarySnapshot,
  photoSources: CardImagePhotoSource[],
): string {
  return JSON.stringify({
    address: snapshot.address,
    viewingAt: snapshot.viewingAt,
    rating: snapshot.overallRating,
    pros: snapshot.pros.filter((item) => item.selected).map((item) => item.id),
    risks: snapshot.risks.filter((item) => item.selected).map((item) => item.id),
    facts: snapshot.facts.filter((item) => item.selected).map((item) => item.id),
    followUps: snapshot.followUps.filter((item) => item.selected).map((item) => item.id),
    actionItems: snapshot.actionItems.filter((item) => item.selected).map((item) => item.id),
    photos: snapshot.photos
      .filter((item) => item.selected)
      .map((item) => ({ id: item.id, note: item.note, tag: item.tag })),
    sources: photoSources.map((source) => source.id),
  });
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
  privacyArmed = true,
  onRequestPrivacy,
  onPrivacyConsumed,
}: {
  snapshot: DecisionSummarySnapshot;
  photoSources: CardImagePhotoSource[];
  locale: string;
  documentLabels: CardImageDocumentLabels;
  uiLabels: CardImageExportUiLabels;
  /** When false, first click asks the parent to run privacy confirm. */
  privacyArmed?: boolean;
  onRequestPrivacy?: () => void;
  onPrivacyConsumed?: () => void;
}) {
  const [state, setState] = useState<ExportState>({ status: "idle" });
  const mounted = useRef(true);
  const pendingFile = useRef<File | null>(null);
  const pendingFingerprint = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fingerprint = snapshotFingerprint(snapshot, photoSources);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (pendingFingerprint.current && pendingFingerprint.current !== fingerprint) {
      pendingFile.current = null;
      pendingFingerprint.current = null;
      queueMicrotask(() => {
        if (mounted.current) setState({ status: "idle" });
      });
    }
  }, [fingerprint]);

  useEffect(() => {
    if (!privacyArmed) return;
    if (state.status !== "idle") return;
    if (!onPrivacyConsumed) return;
    // Parent just armed privacy after confirm — continue export on next tick.
    queueMicrotask(() => {
      if (mounted.current) void runExport();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to arming
  }, [privacyArmed]);

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

  async function shareOrDownload(file: File) {
    if (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        title: uiLabels.fileShareTitle,
        files: [file],
      });
      return;
    }
    downloadBlob(file, file.name);
  }

  async function runExport() {
    onPrivacyConsumed?.();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);

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
        controller.signal,
      );
      if (mounted.current) setState({ status: "generating" });
      const model = buildCardImageModel(publicModel.snapshot, photos);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const blob = await renderCardImageJpeg(
        model,
        documentLabels,
        locale,
        controller.signal,
      );
      const file = new File([blob], model.fileName, { type: "image/jpeg" });
      const canShareFile =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFile) {
        pendingFile.current = file;
        pendingFingerprint.current = fingerprint;
        if (mounted.current) setState({ status: "ready" });
        return;
      }
      downloadBlob(blob, model.fileName);
      pendingFile.current = null;
      pendingFingerprint.current = null;
      if (mounted.current) setState({ status: "success" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (mounted.current) {
          setState({ status: "error", message: uiLabels.error });
        }
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
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function exportImage() {
    const preparedFile = pendingFile.current;
    if (preparedFile && pendingFingerprint.current === fingerprint) {
      try {
        await shareOrDownload(preparedFile);
        pendingFile.current = null;
        pendingFingerprint.current = null;
        if (mounted.current) setState({ status: "success" });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          pendingFile.current = null;
          pendingFingerprint.current = null;
          if (mounted.current) setState({ status: "error", message: uiLabels.error });
        }
      }
      return;
    }

    if (!privacyArmed) {
      onRequestPrivacy?.();
      return;
    }

    await runExport();
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
      ) : state.status === "ready" ? (
        <p role="status" className="text-[11px] text-[#166534] text-center">
          {uiLabels.readyHint}
        </p>
      ) : state.status === "success" ? (
        <p role="status" className="text-[11px] text-[#166534] text-center">
          {uiLabels.success}
        </p>
      ) : null}
    </div>
  );
}
