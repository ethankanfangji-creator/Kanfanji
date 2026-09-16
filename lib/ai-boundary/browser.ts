import { AI_LIMITS, IMAGE_MIME_TYPES } from "./config";

/** The only browser-side AI execution gate; a decline never invokes the task. */
export async function runIfAiConsented<T>(
  accepted: boolean,
  task: () => Promise<T>,
): Promise<{ started: false } | { started: true; value: T }> {
  if (!accepted) return { started: false };
  return { started: true, value: await task() };
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const limit = Math.max(1, Math.min(Math.floor(concurrency) || 1, 6));
  const results = new Array<PromiseSettledResult<R>>(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await worker(values[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return results;
}

export async function normalizeImageForAi(
  source: Blob,
  options?: { maxDimension?: number; quality?: number },
): Promise<Blob> {
  if (!IMAGE_MIME_TYPES.has(source.type)) throw new Error("image_mime_invalid");
  const maxDimension = Math.max(320, Math.min(options?.maxDimension ?? 1280, 2048));
  const quality = Math.max(0.5, Math.min(options?.quality ?? 0.78, 0.9));
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image_normalization_failed");
    context.drawImage(bitmap, 0, 0, width, height);
    const output = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("image_normalization_failed"))),
        "image/jpeg",
        quality,
      ),
    );
    if (output.size > AI_LIMITS.imageBytes) {
      throw new Error("image_too_large");
    }
    return output;
  } finally {
    bitmap.close();
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("image_read_failed"));
    reader.readAsDataURL(blob);
  });
}
