export const MEDIA_IMPORT_LIMITS = {
  photoBytes: 25 * 1024 * 1024,
  videoBytes: 250 * 1024 * 1024,
} as const;

export type ImportedMediaKind = "photo" | "video";

export function validateImportedMedia(file: File, kind: ImportedMediaKind): string | null {
  const expectedPrefix = kind === "photo" ? "image/" : "video/";
  if (!file.type.toLowerCase().startsWith(expectedPrefix)) {
    return kind === "photo" ? "invalid-photo-type" : "invalid-video-type";
  }
  const limit =
    kind === "photo" ? MEDIA_IMPORT_LIMITS.photoBytes : MEDIA_IMPORT_LIMITS.videoBytes;
  if (file.size === 0) return "empty-file";
  if (file.size > limit) return kind === "photo" ? "photo-too-large" : "video-too-large";
  return null;
}
