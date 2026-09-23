"use client";

import { getMedia } from "@/lib/idb/draft-store";
import { selectedPhotos, type DecisionSummarySnapshot } from "@/lib/share-card";
import type { CardImagePhotoSource, PreparedCardImagePhoto } from "./types";

const DESKTOP_MAX_EDGE = 900;
const IOS_MAX_EDGE = 720;
const JPEG_QUALITY = 0.72;

export class CardImagePreparationError extends Error {
  readonly photoIds: string[];

  constructor(photoIds: string[]) {
    super("CARD_IMAGE_PREPARATION_FAILED");
    this.name = "CardImagePreparationError";
    this.photoIds = photoIds;
  }
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new DOMException("Aborted", "AbortError");
    throw error;
  }
}

async function normalizedPreparedPhoto(
  blob: Blob,
  meta: { id: string; tag: string; note: string },
  maxEdge: number,
  signal?: AbortSignal,
): Promise<PreparedCardImagePhoto> {
  throwIfAborted(signal);
  let bitmap: ImageBitmap | null = null;
  let image: HTMLImageElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  const objectUrl = URL.createObjectURL(blob);
  try {
    let naturalWidth = 0;
    let naturalHeight = 0;
    let source: CanvasImageSource;

    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(blob);
      throwIfAborted(signal);
      naturalWidth = bitmap.width;
      naturalHeight = bitmap.height;
      source = bitmap;
    } else {
      image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
        element.src = objectUrl;
      });
      throwIfAborted(signal);
      naturalWidth = image.naturalWidth;
      naturalHeight = image.naturalHeight;
      source = image;
    }

    const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const activeCanvas = document.createElement("canvas");
    canvas = activeCanvas;
    activeCanvas.width = width;
    activeCanvas.height = height;
    const context = activeCanvas.getContext("2d");
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    throwIfAborted(signal);
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
      blob: output,
      width,
      height,
    };
  } finally {
    bitmap?.close();
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
  signal?: AbortSignal,
): Promise<Blob> {
  throwIfAborted(signal);
  if (source?.mediaId) {
    const media = await getMedia(source.mediaId);
    if (media?.blob) return media.blob;
  }
  const url = source?.url || fallbackUrl;
  if (!url) throw new Error(`PHOTO_SOURCE_MISSING:${photoId}`);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`PHOTO_FETCH_FAILED:${photoId}`);
  return response.blob();
}

export async function prepareCardImagePhotos(
  snapshot: DecisionSummarySnapshot,
  sources: CardImagePhotoSource[],
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<PreparedCardImagePhoto[]> {
  const selected = selectedPhotos(snapshot.photos);
  const byId = new Map(sources.map((source) => [source.id, source]));
  const prepared: PreparedCardImagePhoto[] = [];
  const failed: string[] = [];
  const maxEdge = isIosSafari() ? IOS_MAX_EDGE : DESKTOP_MAX_EDGE;

  for (let index = 0; index < selected.length; index += 1) {
    throwIfAborted(signal);
    const photo = selected[index];
    try {
      const blob = await resolvePhotoBlob(
        photo.id,
        byId.get(photo.id),
        photo.url,
        signal,
      );
      prepared.push(
        await normalizedPreparedPhoto(
          blob,
          {
            id: photo.id,
            tag: photo.tag,
            note: photo.note,
          },
          maxEdge,
          signal,
        ),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      failed.push(photo.id);
    }
    onProgress?.(index + 1, selected.length);
  }

  if (failed.length > 0) throw new CardImagePreparationError(failed);
  return prepared;
}
