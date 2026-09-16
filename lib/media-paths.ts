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
  // 32 CSPRNG bytes → 64 hex. Avoid Date.now sequential / guessable tokens.
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Node / older runtimes
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomBytes } = require("node:crypto") as typeof import("node:crypto");
    return randomBytes(32).toString("hex");
  } catch {
    // Last resort — still non-sequential but weaker than CSPRNG
    return `s${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  }
}
