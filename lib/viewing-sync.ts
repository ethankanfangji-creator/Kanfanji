import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "./supabase";
import { newShareToken, toStoragePath } from "./media-paths";
import { ensureShareAccessOnProperty } from "@/lib/share-access/server";

export type ViewingSyncPayload = {
  address: string;
  tags: string[];
  market: "CA" | "TH" | "OTHER";
  questions: unknown[];
  notes: unknown[];
  pros: string[];
  risks: string[];
  property?: Record<string, unknown>;
  propertyId?: string | null;
  isPro: boolean;
  clientUpdatedAt: string;
  shareToken?: string | null;
};

export type SaveViewingResult = {
  id: string;
  shareToken: string;
  skippedAsStale: boolean;
};

function buildRow(payload: ViewingSyncPayload, userId: string, shareToken: string) {
  const property = ensureShareAccessOnProperty(payload.property ?? {}, shareToken);
  return {
    address: payload.address.trim(),
    tags: payload.tags,
    market: payload.market === "OTHER" ? "CA" : payload.market,
    questions: payload.questions,
    notes: payload.notes,
    pros: payload.pros,
    risks: payload.risks,
    property,
    user_id: userId,
    is_pro: payload.isPro,
    property_id: payload.propertyId ?? null,
    share_token: shareToken,
    client_updated_at: payload.clientUpdatedAt,
    updated_at: new Date().toISOString(),
  };
}

async function tryWrite(
  supabase: SupabaseClient,
  mode: "insert" | "update",
  row: Record<string, unknown>,
  viewingId?: string,
) {
  const stripKeys = [
    "revision",
    "property_id",
    "property",
    "notes",
    "pros",
    "risks",
    "audio_urls",
    "share_token",
    "client_updated_at",
  ] as const;

  const attempt: Record<string, unknown> = { ...row };
  for (let i = 0; i < stripKeys.length + 1; i += 1) {
    if (mode === "insert") {
      const insertRow: Record<string, unknown> = {
        ...attempt,
        photo_urls: [],
        video_urls: [],
      };
      if ("audio_urls" in attempt) {
        insertRow.audio_urls = attempt.audio_urls ?? [];
      }
      const { data, error } = await supabase
        .from("viewings")
        .insert(insertRow)
        .select("id")
        .single();
      if (!error && data) return { data, error: null as null };
      if (!error) return { data: null, error: new Error("存檔失敗：沒有回傳 id") };
      const msg = error.message || "";
      const nextKey = stripKeys.find((key) => key in attempt && msg.includes(key));
      if (!nextKey) return { data: null, error };
      delete attempt[nextKey];
      continue;
    }

    const { data, error } = await supabase
      .from("viewings")
      .update(attempt)
      .eq("id", viewingId!)
      .select("id")
      .maybeSingle();
    if (!error) return { data, error: null as null };
    const msg = error.message || "";
    const nextKey = stripKeys.find((key) => key in attempt && msg.includes(key));
    if (!nextKey) return { data: null, error };
    delete attempt[nextKey];
  }
  return { data: null, error: new Error("存檔失敗") };
}

/**
 * Insert or update a viewing with last-write-wins on client_updated_at.
 */
export async function saveViewingRecord(
  supabase: SupabaseClient,
  userId: string,
  payload: ViewingSyncPayload,
  existingId: string | null,
): Promise<SaveViewingResult> {
  const shareToken = payload.shareToken || newShareToken();
  const row = buildRow(payload, userId, shareToken);

  if (existingId) {
    // LWW: skip if server has a newer client_updated_at
    let { data: current, error: currentError } = await supabase
      .from("viewings")
      .select("client_updated_at, revision")
      .eq("id", existingId)
      .maybeSingle();
    if (currentError?.message.includes("revision")) {
      const fallback = await supabase
        .from("viewings")
        .select("client_updated_at")
        .eq("id", existingId)
        .maybeSingle();
      current = fallback.data as typeof current;
      currentError = fallback.error;
    }
    if (currentError) throw currentError;

    const serverTs = current?.client_updated_at
      ? Date.parse(String(current.client_updated_at))
      : 0;
    const incomingTs = Date.parse(payload.clientUpdatedAt) || 0;
    if (serverTs && incomingTs && incomingTs < serverTs) {
      return {
        id: existingId,
        shareToken,
        skippedAsStale: true,
      };
    }

    const currentRevision =
      typeof current?.revision === "number" ? current.revision : null;
    const updateRow =
      currentRevision == null
        ? row
        : { ...row, revision: currentRevision + 1 };
    const { error } = await tryWrite(
      supabase,
      "update",
      updateRow,
      existingId,
    );
    if (error) throw error;
    return {
      id: existingId,
      shareToken,
      skippedAsStale: false,
    };
  }

  const { data, error } = await tryWrite(supabase, "insert", row);
  if (error) throw error;
  if (!data?.id) throw new Error("存檔失敗：沒有回傳 id");
  return {
    id: String(data.id),
    shareToken,
    skippedAsStale: false,
  };
}

/** Server-side: sign paths for private bucket (admin or user client). */
export async function signPathsWithClient(
  supabase: SupabaseClient,
  pathsOrUrls: string[],
  expiresIn = 3600,
): Promise<string[]> {
  const paths = pathsOrUrls
    .map((item) => toStoragePath(item) ?? (item.startsWith("http") ? null : item))
    .filter((p): p is string => Boolean(p));

  if (paths.length === 0) {
    // Legacy public URLs may still work until bucket is flipped private.
    return pathsOrUrls.filter((u) => u.startsWith("http"));
  }

  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(paths, expiresIn);
  if (error || !data) {
    return [];
  }
  return data.map((item) => item.signedUrl).filter((u): u is string => Boolean(u));
}
