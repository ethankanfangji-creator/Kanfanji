"use client";

import { getMedia } from "@/lib/idb/draft-store";
import { selectedPhotos, type DecisionSummarySnapshot } from "@/lib/share-card";
import type { CardImagePhotoSource, PreparedCardImagePhoto } from "./types";

const MAX_EDGE = 900;
const JPEG_QUALITY = 0.75;

export class CardImagePreparationError extends Error {
  readonly photoIds: string[];

  constructor(photoIds: string[]) {
    super("CARD_IMAGE_PREPARATION_FAILED");
    this.name = "CardImagePreparationError";
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

async function normalizedPreparedPhoto(
  blob: Blob,
  meta: { id: string; tag: string; note: string },
): Promise<PreparedCardImagePhoto> {
  const objectUrl = URL.createObjectURL(blob);
  let image: HTMLImageElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  try {
    image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
      element.src = objectUrl;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const activeCanvas = document.createElement("canvas");
    canvas = activeCanvas;
    activeCanvas.width = width;
    activeCanvas.height = height;
    const context = activeCanvas.getContext("2d");
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const output = await new Promise<Blob>((resolve, reject) => {
      activeCanvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("IMAGE_ENCODE_FAILED"))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
    return {
      id: meta.id,
      tag: meta.tag,
      note: meta.note,
      dataUrl: await readAsDataUrl(output),
      width,
      height,
    };
  } finally {
    if (image) image.src = "";
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
    URL.revokeObjectURL(objectUrl);
  }
}

async function resolvePhotoBlob(
  photoId: string,
  source: CardImagePhotoSource | undefined,
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

export async function prepareCardImagePhotos(
  snapshot: DecisionSummarySnapshot,
  sources: CardImagePhotoSource[],
  onProgress?: (completed: number, total: number) => void,
): Promise<PreparedCardImagePhoto[]> {
  const selected = selectedPhotos(snapshot.photos);
  const byId = new Map(sources.map((source) => [source.id, source]));
  const prepared: PreparedCardImagePhoto[] = [];
  const failed: string[] = [];

  for (let index = 0; index < selected.length; index += 1) {
    const photo = selected[index];
    try {
      const blob = await resolvePhotoBlob(photo.id, byId.get(photo.id), photo.url);
      prepared.push(
        await normalizedPreparedPhoto(blob, {
          id: photo.id,
          tag: photo.tag,
          note: photo.note,
        }),
      );
    } catch {
      failed.push(photo.id);
    }
    onProgress?.(index + 1, selected.length);
  }

  if (failed.length > 0) throw new CardImagePreparationError(failed);
  return prepared;
}
