const FOLDERS = {
  photos: "photo_urls",
  videos: "video_urls",
  audios: "audio_urls",
} as const;

export type MediaColumn = (typeof FOLDERS)[keyof typeof FOLDERS];

export function classifyOwnedMediaPath(
  path: string,
  userId: string,
  viewingId: string,
): MediaColumn | null {
  const prefix = `${userId}/${viewingId}/`;
  if (!path.startsWith(prefix) || path.includes("..")) return null;
  const rest = path.slice(prefix.length);
  const [folder, name] = rest.split("/");
  if (!name || rest.split("/").length !== 2) return null;
  if (folder !== "photos" && folder !== "videos" && folder !== "audios") return null;
  return FOLDERS[folder];
}
