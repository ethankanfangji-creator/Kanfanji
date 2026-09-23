import { getSupabase, MEDIA_BUCKET } from "./supabase";
import { extensionFor, toStoragePath } from "./media-paths";

const SIGNED_TTL_SECONDS = 60 * 60; // 1 hour

async function requireAuthedClient() {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("尚未設定 Supabase URL / Key");
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) {
    throw new Error("請先登入後再上傳");
  }

  return { supabase, user };
}

export type MediaFolder = "photos" | "videos" | "audios";

export async function uploadViewingFile(
  viewingId: string,
  folder: MediaFolder,
  file: Blob,
  filename: string,
): Promise<string> {
  const { supabase } = await requireAuthedClient();

  const { data: viewing, error: viewingError } = await supabase
    .from("viewings")
    .select("user_id")
    .eq("id", viewingId)
    .maybeSingle();
  if (viewingError) throw viewingError;
  if (!viewing?.user_id) throw new Error("找不到案件或沒有媒體權限");

  // Canonical path remains owner_id/viewing_id/... for both owner and editor.
  const ownerId = String(viewing.user_id);
  const path = `${ownerId}/${viewingId}/${folder}/${filename}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  // Persist storage path (not public URL) — bucket is private.
  return path;
}

export async function createSignedMediaUrl(
  pathOrUrl: string,
  expiresIn = SIGNED_TTL_SECONDS,
): Promise<string | null> {
  const path = toStoragePath(pathOrUrl);
  if (!path) return pathOrUrl.startsWith("http") ? pathOrUrl : null;

  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function createSignedMediaUrls(
  pathsOrUrls: string[],
  expiresIn = SIGNED_TTL_SECONDS,
): Promise<string[]> {
  const results = await Promise.all(
    pathsOrUrls.map(async (item) => (await createSignedMediaUrl(item, expiresIn)) ?? ""),
  );
  return results.filter(Boolean);
}

/**
 * Append a storage path to a media URL array with revision-based CAS when the
 * collaboration migration is available.
 */
export async function appendViewingPath(
  viewingId: string,
  column: "photo_urls" | "video_urls" | "audio_urls",
  path: string,
) {
  const response = await fetch(`/api/viewings/${viewingId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ column, path }),
  });
  if (response.ok) return;
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  throw new Error(body?.error || "MEDIA_APPEND_FAILED");
}

/** @deprecated Prefer appendViewingPath; kept for call-site compatibility during migrate. */
export async function appendViewingUrl(
  viewingId: string,
  column: "photo_urls" | "video_urls",
  url: string,
) {
  const path = toStoragePath(url) ?? url;
  await appendViewingPath(viewingId, column, path);
}

export { extensionFor };
