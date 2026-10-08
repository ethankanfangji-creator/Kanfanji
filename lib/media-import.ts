export const MEDIA_IMPORT_LIMITS = {
  photoBytes: 25 * 1024 * 1024,
  videoBytes: 250 * 1024 * 1024,
  /** Generic attach-any-file ceiling (docs, zip, etc.). */
  fileBytes: 50 * 1024 * 1024,
} as const;

export type ImportedMediaKind = "photo" | "video";

export function takeInputFiles(
  input: Pick<HTMLInputElement, "files" | "value">,
): File[] {
  const files = Array.from(input.files ?? []);
  input.value = "";
  return files;
}

/** True when a composer file attachment should become a first-class video note. */
export function isVideoAttachment(file: Pick<File, "type" | "name">): boolean {
  if (file.type.toLowerCase().startsWith("video/")) return true;
  return /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name || "");
}

/** Formats the explicit「讀檔」extractor can turn into note text. */
export function isReadableAttachment(file: Pick<File, "type" | "name">): boolean {
  const mime = (file.type || "").toLowerCase();
  const name = file.name || "";
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return true;
  if (
    mime === "text/plain" ||
    mime === "text/markdown" ||
    mime === "text/csv" ||
    mime === "application/json"
  ) {
    return true;
  }
  return /\.(txt|md|csv|json)$/i.test(name);
}

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

export type MediaImportErrorCopy = {
  invalidPhoto: string;
  invalidVideo: string;
  emptyFile: string;
  photoTooLarge: string;
  videoTooLarge: string;
};

/** Map validateImportedMedia codes to localized copy. */
export function mapMediaImportErrorCode(code: string, copy: MediaImportErrorCopy): string {
  if (code === "invalid-photo-type") return copy.invalidPhoto;
  if (code === "invalid-video-type") return copy.invalidVideo;
  if (code === "empty-file") return copy.emptyFile;
  if (code === "photo-too-large") return copy.photoTooLarge;
  return copy.videoTooLarge;
}
