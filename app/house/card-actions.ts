"use server";

import { MEDIA_BUCKET } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { MEDIA_SIGNED_TTL_SECONDS, absoluteStorageSignedUrl, assertOwnerMediaPath } from "@/lib/media-sign";
import type { CardTemplate } from "@/lib/viewing-card-templates";
import {
  cardNotes,
  cardPhotoStoragePath,
  cardScore,
  isStoredCardPhotoPath,
  type CardPhoto,
  type CardScore,
  type ViewingCardState,
} from "@/lib/viewing-card-record";
import { createAdminClient } from "@/utils/supabase/admin";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 8_000_000;

async function ownedTemplate(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], templateId: string) {
  const { data, error } = await supabase
    .from("viewing_card_templates")
    .select("id")
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function touchCard(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  input: {
    viewingId: string;
    templateId: string;
    userId: string;
    status?: CardScore;
    notes?: string;
  },
) {
  const template = await ownedTemplate(supabase, input.templateId);
  if (!template) return { ok: false as const, error: "找不到這張卡。" };

  const row: Record<string, unknown> = {
    viewing_id: input.viewingId,
    template_id: input.templateId,
    collected_by: input.userId,
    updated_at: new Date().toISOString(),
  };
  if (input.status) row.status = input.status;
  if (input.notes !== undefined) row.notes = input.notes;

  const { data, error } = await supabase
    .from("viewing_cards")
    .upsert(row, { onConflict: "viewing_id,template_id" })
    .select("id, status, notes, photos")
    .single();
  if (error || !data) return { ok: false as const, error: "儲存失敗，請再試一次。" };
  return {
    ok: true as const,
    card: data as { id: string; status: string; notes: string | null; photos: string[] | null },
  };
}

export async function saveCardScore(input: {
  viewingId: string;
  templateId: string;
  status: string;
}): Promise<{ status: CardScore } | { error: string }> {
  const status = cardScore(input.status);
  if (!status) return { error: "評分不正確。" };
  const { supabase, user } = await requireUser();
  const saved = await touchCard(supabase, {
    viewingId: input.viewingId,
    templateId: input.templateId,
    userId: user.id,
    status,
  });
  if (!saved.ok) return { error: saved.error };
  return { status: cardScore(saved.card.status) ?? "unsure" };
}

export async function saveCardNotes(input: {
  viewingId: string;
  templateId: string;
  notes: string;
}): Promise<{ notes: string } | { error: string }> {
  const notes = cardNotes(input.notes);
  if (notes === null) return { error: "備註太長。" };
  const { supabase, user } = await requireUser();
  const saved = await touchCard(supabase, {
    viewingId: input.viewingId,
    templateId: input.templateId,
    userId: user.id,
    notes,
  });
  if (!saved.ok) return { error: saved.error };
  return { notes: saved.card.notes ?? "" };
}

export async function addCardPhoto(formData: FormData): Promise<{ photo: CardPhoto } | { error: string }> {
  const viewingId = String(formData.get("viewingId") || "");
  const templateId = String(formData.get("templateId") || "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) return { error: "請選擇一張照片。" };
  if (!IMAGE_TYPES.has(file.type) || file.size > MAX_PHOTO_BYTES) {
    return { error: "請上傳 8MB 以內的 JPEG、PNG 或 WebP。" };
  }

  const { supabase, user } = await requireUser();
  const saved = await touchCard(supabase, {
    viewingId,
    templateId,
    userId: user.id,
  });
  if (!saved.ok) return { error: saved.error };

  const path = cardPhotoStoragePath({
    ownerId: user.id,
    viewingId,
    cardId: saved.card.id,
    file,
  });
  const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return { error: "照片上傳失敗，請再試一次。" };

  const photos = Array.isArray(saved.card.photos) ? saved.card.photos.filter((item) => typeof item === "string") : [];
  if (!isStoredCardPhotoPath(path, user.id, viewingId, saved.card.id)) {
    return { error: "照片路徑不正確。" };
  }
  const nextPhotos = [...photos, path];
  const { error: updateError } = await supabase
    .from("viewing_cards")
    .update({ photos: nextPhotos, updated_at: new Date().toISOString() })
    .eq("id", saved.card.id);
  if (updateError) return { error: "照片沒有存進這張卡。" };

  const admin = createAdminClient();
  const signed = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(path, MEDIA_SIGNED_TTL_SECONDS);
  const url = absoluteStorageSignedUrl(signed.data?.signedUrl);
  if (signed.error || !url) return { error: "照片已上傳，但暫時無法顯示。" };
  return { photo: { path, url } };
}

export async function loadChatCards(viewingId: string): Promise<
  { templates: CardTemplate[]; records: ViewingCardState[] } | { error: string }
> {
  const { supabase, user } = await requireUser();
  const { data: viewing, error } = await supabase
    .from("viewings")
    .select("id")
    .eq("id", viewingId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !viewing) return { error: "看房卡片讀取失敗，請再試一次。" };

  const { data: templateRows, error: templateError } = await supabase
    .from("viewing_card_templates")
    .select("id, name, icon, sort_order, is_system")
    .order("sort_order", { ascending: true });
  if (templateError) return { error: "看房卡片讀取失敗，請再試一次。" };

  const templates: CardTemplate[] = (templateRows ?? [])
    .map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      sortOrder: row.sort_order,
      isSystem: row.is_system,
    }))
    .sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.sortOrder - b.sortOrder);

  const { data, error: cardError } = await supabase
    .from("viewing_cards")
    .select("template_id, status, notes, photos, voice_transcript")
    .eq("viewing_id", viewingId);
  if (cardError) return { error: "看房卡片讀取失敗，請再試一次。" };

  const paths = (data ?? []).flatMap((row) =>
    Array.isArray(row.photos) ? row.photos.filter((item): item is string => typeof item === "string") : [],
  );
  const signed = new Map<string, string>();
  const safePaths = paths.filter((path) => {
    try {
      assertOwnerMediaPath(path, user.id);
      return true;
    } catch {
      return false;
    }
  });
  if (safePaths.length > 0) {
    const admin = createAdminClient();
    const result = await admin.storage.from(MEDIA_BUCKET).createSignedUrls(safePaths, MEDIA_SIGNED_TTL_SECONDS);
    result.data?.forEach((row, index) => {
      const raw = row.signedUrl || ("signedURL" in row ? String(row.signedURL) : "");
      const url = absoluteStorageSignedUrl(raw);
      if (url) signed.set(safePaths[index], url);
    });
  }

  const records: ViewingCardState[] = (data ?? []).map((row) => {
    const photos: CardPhoto[] = (Array.isArray(row.photos) ? row.photos : [])
      .filter((item): item is string => typeof item === "string")
      .map((path) => ({ path, url: signed.get(path) ?? "" }))
      .filter((photo) => photo.url);
    return {
      templateId: row.template_id,
      status: cardScore(String(row.status)),
      notes: row.notes ?? "",
      photos,
      voiceTranscript: row.voice_transcript ?? "",
    };
  });

  return { templates, records };
}
