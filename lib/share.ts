import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { MEDIA_BUCKET } from "@/lib/supabase";
import { toStoragePath } from "@/lib/media-paths";
import type { Viewing } from "@/lib/types";

async function signPaths(pathsOrUrls: string[], expiresIn = 3600): Promise<string[]> {
  if (pathsOrUrls.length === 0) return [];

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    supabase = await createClient();
  }

  const paths = pathsOrUrls
    .map((item) => toStoragePath(item))
    .filter((p): p is string => Boolean(p));

  if (paths.length === 0) {
    return pathsOrUrls.filter((u) => u.startsWith("http"));
  }

  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(paths, expiresIn);
  if (error || !data) {
    // Fallback: return original http URLs if still public.
    return pathsOrUrls.filter((u) => u.startsWith("http"));
  }
  return data.map((row) => row.signedUrl).filter((u): u is string => Boolean(u));
}

export async function hydrateViewingMedia(viewing: Viewing): Promise<Viewing> {
  const [photo_urls, video_urls, audio_urls] = await Promise.all([
    signPaths(viewing.photo_urls ?? []),
    signPaths(viewing.video_urls ?? []),
    signPaths(viewing.audio_urls ?? []),
  ]);
  return { ...viewing, photo_urls, video_urls, audio_urls };
}

export async function fetchViewingByShareToken(token: string): Promise<Viewing | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_viewing_by_share_token", {
      p_token: trimmed,
    });
    if (error || !data?.[0]) return null;
    return data[0] as Viewing;
  }

  const { data, error } = await admin.rpc("get_viewing_by_share_token", {
    p_token: trimmed,
  });
  if (!error && data?.[0]) {
    return data[0] as Viewing;
  }

  // Fallback before RPC migration is applied.
  const { data: row } = await admin
    .from("viewings")
    .select("*")
    .eq("share_token", trimmed)
    .maybeSingle();
  return (row as Viewing | null) ?? null;
}
