import { getSupabase, MEDIA_BUCKET } from "./supabase";

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

export async function uploadViewingFile(
  viewingId: string,
  folder: "photos" | "videos",
  file: Blob,
  filename: string,
) {
  const { supabase, user } = await requireAuthedClient();

  const path = `${user.id}/${viewingId}/${folder}/${filename}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function appendViewingUrl(
  viewingId: string,
  column: "photo_urls" | "video_urls",
  url: string,
) {
  const { supabase } = await requireAuthedClient();

  const { data, error } = await supabase
    .from("viewings")
    .select("photo_urls, video_urls")
    .eq("id", viewingId)
    .single();
  if (error) throw error;

  const current = (data?.[column] ?? []) as string[];
  const { error: updateError } = await supabase
    .from("viewings")
    .update({
      [column]: [...current, url],
      updated_at: new Date().toISOString(),
    })
    .eq("id", viewingId);
  if (updateError) throw updateError;
}
