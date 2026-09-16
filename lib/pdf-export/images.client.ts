"use client";

import { getMedia } from "@/lib/idb/draft-store";
import { selectedPhotos, type DecisionSummarySnapshot } from "@/lib/share-card";
import type { PdfPhotoSource, PreparedPdfPhoto } from "./types";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export class PdfImagePreparationError extends Error {
  readonly photoIds: string[];

  constructor(photoIds: string[]) {
    super("PDF_IMAGE_PREPARATION_FAILED");
    this.name = "PdfImagePreparationError";
    this.photoIds = photoIds;
  }
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FILE_READ_FAILED"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

async function normalizedImageDataUrl(blob: Blob): Promise<string> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
      element.src = objectUrl;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const output = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("IMAGE_ENCODE_FAILED"))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
    return readAsDataUrl(output);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function resolvePhotoBlob(
  photoId: string,
  source: PdfPhotoSource | undefined,
  fallbackUrl: string,
): Promise<Blob> {
  if (source?.mediaId) {
    const media = await getMedia(source.mediaId);
    if (media?.blob) return media.blob;
  }
  const url = source?.url || fallbackUrl;
  if (!url) throw new Error(`PHOTO_SOURCE_MISSING:${photoId}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PHOTO_FETCH_FAILED:${photoId}`);
  return response.blob();
}

export async function preparePdfPhotos(
  snapshot: DecisionSummarySnapshot,
  sources: PdfPhotoSource[],
  onProgress?: (completed: number, total: number) => void,
): Promise<PreparedPdfPhoto[]> {
  const selected = selectedPhotos(snapshot.photos);
  const byId = new Map(sources.map((source) => [source.id, source]));
  const prepared: PreparedPdfPhoto[] = [];
  const failed: string[] = [];

  for (let index = 0; index < selected.length; index += 1) {
    const photo = selected[index];
    try {
      const blob = await resolvePhotoBlob(photo.id, byId.get(photo.id), photo.url);
      prepared.push({
        id: photo.id,
        tag: photo.tag,
        note: photo.note,
        dataUrl: await normalizedImageDataUrl(blob),
      });
    } catch {
      failed.push(photo.id);
    }
    onProgress?.(index + 1, selected.length);
  }

  if (failed.length > 0) throw new PdfImagePreparationError(failed);
  return prepared;
}

