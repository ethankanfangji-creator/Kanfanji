/**
 * Photo storage strategy (device IndexedDB `media` store):
 * - `blob`: original capture / import bytes (source of truth for upload + Vision).
 * - `thumbBlob`: optional downscaled JPEG for grid UI only (lazy decode, small).
 * - List UI prefers `thumbBlob` object URL; full `blob` URL is created on expand.
 * - Thumbs are best-effort; if generation fails, UI falls back to original or placeholder.
 * - Quota enforcement counts original `size` + thumb bytes.
 */

export const THUMB_MAX_EDGE = 320;
export const THUMB_JPEG_QUALITY = 0.72;

export async function createImageThumbnail(
  source: Blob,
  options?: { maxEdge?: number; quality?: number },
): Promise<{ blob: Blob; mimeType: string } | null> {
  if (typeof createImageBitmap !== "function") return null;
  const maxEdge = options?.maxEdge ?? THUMB_MAX_EDGE;
  const quality = options?.quality ?? THUMB_JPEG_QUALITY;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(source);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : (() => {
            const el = document.createElement("canvas");
            el.width = width;
            el.height = height;
            return el;
          })();

    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx || !("drawImage" in ctx)) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);

    if ("convertToBlob" in canvas) {
      const blob = await (canvas as OffscreenCanvas).convertToBlob({
        type: "image/jpeg",
        quality,
      });
      return { blob, mimeType: "image/jpeg" };
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      (canvas as HTMLCanvasElement).toBlob((b) => resolve(b), "image/jpeg", quality);
    });
    return blob ? { blob, mimeType: "image/jpeg" } : null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}
