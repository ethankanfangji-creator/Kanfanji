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
  const { supabase, user } = await requireAuthedClient();

  const path = `${user.id}/${viewingId}/${folder}/${filename}`;
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
 * Append a storage path to a media URL array with a compare-and-set style read.
 * Last successful writer wins for the array contents (LWW at row level is handled by sync).
 */
export async function appendViewingPath(
  viewingId: string,
  column: "photo_urls" | "video_urls" | "audio_urls",
  path: string,
) {
  const { supabase } = await requireAuthedClient();

  const { data, error } = await supabase
    .from("viewings")
    .select("photo_urls, video_urls, audio_urls")
    .eq("id", viewingId)
    .single();
  if (error) throw error;

  const current = ((data as Record<string, string[] | undefined>)?.[column] ?? []) as string[];
  if (current.includes(path)) return;

  const { error: updateError } = await supabase
    .from("viewings")
    .update({
      [column]: [...current, path],
      updated_at: new Date().toISOString(),
    })
    .eq("id", viewingId);
  if (updateError) {
    // Older DBs may lack audio_urls — fall back silently for that column only.
    if (column === "audio_urls" && updateError.message.includes("audio_urls")) {
      return;
    }
    throw updateError;
  }
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
