import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "./supabase";
import { toStoragePath } from "./media-paths";

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
  idempotencyKey: string;
  expectedRevision: number | null;
};

export type SaveViewingResult = {
  id: string;
  skippedAsStale: boolean;
  conflict: boolean;
  revision: number;
};

function buildRow(payload: ViewingSyncPayload, userId: string) {
  return {
    address: payload.address.trim(),
    tags: payload.tags,
    market: payload.market === "OTHER" ? "CA" : payload.market,
    questions: payload.questions,
    notes: payload.notes,
    pros: payload.pros,
    risks: payload.risks,
    property: payload.property ?? {},
    user_id: userId,
    is_pro: payload.isPro,
    property_id: payload.propertyId ?? null,
    client_updated_at: payload.clientUpdatedAt,
    idempotency_key: payload.idempotencyKey,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Idempotent create and revision-CAS update. Zero updated rows is a conflict.
 */
export async function saveViewingRecord(
  supabase: SupabaseClient,
  userId: string,
  payload: ViewingSyncPayload,
  existingId: string | null,
): Promise<SaveViewingResult> {
  const row = buildRow(payload, userId);

  if (existingId) {
    const {
      user_id: _userId,
      idempotency_key: _idempotencyKey,
      is_pro: _isPro,
      property_id: _propertyId,
      ...mutableRow
    } = row;
    void _userId;
    void _idempotencyKey;
    void _isPro;
    void _propertyId;
    const { data: current, error: currentError } = await supabase
      .from("viewings")
      .select("client_updated_at, revision")
      .eq("id", existingId)
      .eq("user_id", userId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) {
      return { id: existingId, skippedAsStale: false, conflict: true, revision: 0 };
    }

    const serverTs = current?.client_updated_at
      ? Date.parse(String(current.client_updated_at))
      : 0;
    const incomingTs = Date.parse(payload.clientUpdatedAt) || 0;
    if (serverTs && incomingTs && incomingTs < serverTs) {
      return {
        id: existingId,
        skippedAsStale: true,
        conflict: true,
        revision: Number(current.revision ?? 0),
      };
    }

    const currentRevision = Number(current.revision);
    const expectedRevision = payload.expectedRevision ?? currentRevision;
    const { data, error } = await supabase
      .from("viewings")
      .update({ ...mutableRow, revision: expectedRevision + 1 })
      .eq("id", existingId)
      .eq("user_id", userId)
      .eq("revision", expectedRevision)
      .select("id, revision")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return {
        id: existingId,
        skippedAsStale: false,
        conflict: true,
        revision: expectedRevision,
      };
    }
    return {
      id: existingId,
      skippedAsStale: false,
      conflict: false,
      revision: Number(data.revision),
    };
  }

  const { data: inserted, error } = await supabase
    .from("viewings")
    .upsert(
      { ...row, photo_urls: [], video_urls: [], audio_urls: [], revision: 1 },
      { onConflict: "user_id,idempotency_key", ignoreDuplicates: true },
    )
    .select("id, revision")
    .maybeSingle();
  if (error) throw error;
  const existing = inserted
    ? null
    : await supabase
        .from("viewings")
        .select("id, revision")
        .eq("user_id", userId)
        .eq("idempotency_key", payload.idempotencyKey)
        .maybeSingle();
  if (existing?.error) throw existing.error;
  const data = inserted ?? existing?.data;
  if (!data?.id) throw new Error("存檔失敗：沒有回傳 id");
  return {
    id: String(data.id),
    skippedAsStale: false,
    conflict: false,
    revision: Number(data.revision),
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
