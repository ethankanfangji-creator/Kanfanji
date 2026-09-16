import {
  selectedPhotos,
  toPublicDecisionSummary,
  type DecisionSummarySnapshot,
} from "@/lib/share-card";
import type { PdfSummaryModel, PreparedPdfPhoto } from "./types";

function safeFilePart(input: string): string {
  const normalized = input
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
  return normalized || "viewing-summary";
}

export function pdfFileName(snapshot: DecisionSummarySnapshot): string {
  const date = snapshot.viewingAt
    ? new Date(snapshot.viewingAt)
    : new Date(snapshot.generatedAt);
  const datePart = Number.isNaN(date.getTime())
    ? ""
    : date.toISOString().slice(0, 10);
  return `${safeFilePart(snapshot.address)}${datePart ? `-${datePart}` : ""}.pdf`;
}

export function buildPdfSummary(
  source: DecisionSummarySnapshot,
  preparedPhotos: PreparedPdfPhoto[],
): PdfSummaryModel {
  const snapshot = toPublicDecisionSummary(source);
  const selectedIds = new Set(
    selectedPhotos(snapshot.photos).map((photo) => photo.id),
  );
  const photos = preparedPhotos.filter((photo) => selectedIds.has(photo.id));
  return {
    snapshot,
    photos,
    fileName: pdfFileName(snapshot),
  };
}

export function formatPdfDate(input: string, locale: string): string {
  if (!input.trim()) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

