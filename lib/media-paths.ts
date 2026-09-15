import { MEDIA_BUCKET } from "./supabase";

/** Extract storage object path from a stored path or legacy public/signed URL. */
export function toStoragePath(pathOrUrl: string): string | null {
  const raw = pathOrUrl.trim();
  if (!raw) return null;
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    return raw.replace(/^\/+/, "");
  }

  try {
    const url = new URL(raw);
    const markers = [
      `/storage/v1/object/public/${MEDIA_BUCKET}/`,
      `/storage/v1/object/sign/${MEDIA_BUCKET}/`,
      `/storage/v1/object/authenticated/${MEDIA_BUCKET}/`,
    ];
    for (const marker of markers) {
      const idx = url.pathname.indexOf(marker);
      if (idx !== -1) {
        const path = decodeURIComponent(url.pathname.slice(idx + marker.length));
        return path.split("?")[0] || null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function extensionFor(file: Blob, fallback: string) {
  if (file.type.includes("webm")) return "webm";
  if (file.type.includes("mp4")) return "mp4";
  if (file.type.includes("mpeg") || file.type.includes("mp3")) return "mp3";
  if (file.type.includes("wav")) return "wav";
  if (file.type.includes("ogg")) return "ogg";
  if (file.type.includes("png")) return "png";
  if (file.type.includes("webp")) return "webp";
  if (file.type.includes("jpeg") || file.type.includes("jpg")) return "jpg";
  return fallback;
}

export function newShareToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
