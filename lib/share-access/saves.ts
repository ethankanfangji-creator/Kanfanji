import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchViewingByShareTokenAdmin, type ShareLinkRow } from "./server";
import { decryptShareToken } from "./token-vault";
import { isShareTokenFormat } from "./crypto";

export type SavedShareListItem = {
  id: string;
  shareLinkId: string;
  address: string;
  urlPath: string;
  status: "active" | "closed" | "revoked" | "expired";
  savedAt: string;
  needsRegenerate: boolean;
  lat: number | null;
  lng: number | null;
};

function addressFromSnapshot(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object") return "";
  const row = snapshot as Record<string, unknown>;
  if (typeof row.address === "string" && row.address.trim()) return row.address.trim();
  const title = row.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return "";
}

function coordsFromSnapshot(snapshot: unknown): { lat: number; lng: number } | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const lat = (snapshot as { lat?: unknown }).lat;
  const lng = (snapshot as { lng?: unknown }).lng;
  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  ) {
    return { lat, lng };
  }
  return null;
}

function linkStatus(row: ShareLinkRow): SavedShareListItem["status"] {
  const expired =
    row.expires_at && new Date(row.expires_at).getTime() <= Date.now();
  if (row.status === "revoked") return "revoked";
  if (row.closed_at) return "closed";
  if (expired) return "expired";
  return "active";
}

function pathForRow(row: ShareLinkRow): { urlPath: string; needsRegenerate: boolean } {
  if (row.token_ciphertext) {
    try {
      return {
        urlPath: `/s/${decryptShareToken(row.token_ciphertext, row.id)}`,
        needsRegenerate: false,
      };
    } catch {
      return { urlPath: "", needsRegenerate: true };
    }
  }
  if (row.token) return { urlPath: `/s/${row.token}`, needsRegenerate: false };
  return { urlPath: "", needsRegenerate: true };
}

export async function getShareSaveState(
  admin: SupabaseClient,
  token: string,
  userId: string | null,
): Promise<{
  ok: true;
  isOwner: boolean;
  saved: boolean;
  signedIn: boolean;
  shareLinkId: string | null;
} | { ok: false; reason: "missing" }> {
  if (!isShareTokenFormat(token)) return { ok: false, reason: "missing" };
  const published = await fetchViewingByShareTokenAdmin(admin, token);
  if (!published) return { ok: false, reason: "missing" };
  const shareLinkId = published.shareLink.id;
  const isOwner = Boolean(userId && published.ownerId === userId);
  if (!userId) {
    return {
      ok: true,
      isOwner: false,
      saved: false,
      signedIn: false,
      shareLinkId,
    };
  }
  if (isOwner) {
    return {
      ok: true,
      isOwner: true,
      saved: false,
      signedIn: true,
      shareLinkId,
    };
  }
  const { data } = await admin
    .from("share_saves")
    .select("id")
    .eq("user_id", userId)
    .eq("share_link_id", shareLinkId)
    .maybeSingle();
  return {
    ok: true,
    isOwner: false,
    saved: Boolean(data?.id),
    signedIn: true,
    shareLinkId,
  };
}

export async function saveShareForUser(
  admin: SupabaseClient,
  token: string,
  userId: string,
): Promise<
  | { ok: true; already: boolean }
  | { ok: false; reason: "missing" | "owner" }
> {
  const published = await fetchViewingByShareTokenAdmin(admin, token);
  if (!published) return { ok: false, reason: "missing" };
  if (published.ownerId === userId) return { ok: false, reason: "owner" };
  const shareLinkId = published.shareLink.id;
  const { data: existing } = await admin
    .from("share_saves")
    .select("id")
    .eq("user_id", userId)
    .eq("share_link_id", shareLinkId)
    .maybeSingle();
  if (existing?.id) return { ok: true, already: true };
  const { error } = await admin.from("share_saves").insert({
    user_id: userId,
    share_link_id: shareLinkId,
  });
  if (error) {
    if (error.code === "23505") return { ok: true, already: true };
    throw error;
  }
  return { ok: true, already: false };
}

export async function listSavedShares(
  admin: SupabaseClient,
  userId: string,
  input?: { q?: string; limit?: number },
): Promise<SavedShareListItem[]> {
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 200);
  const { data: saves, error } = await admin
    .from("share_saves")
    .select("id, created_at, share_link_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (saves ?? []) as Array<{
    id: string;
    created_at: string;
    share_link_id: string;
  }>;
  if (rows.length === 0) return [];

  const linkIds = rows.map((row) => row.share_link_id);
  const { data: links, error: linkError } = await admin
    .from("share_links")
    .select(
      "id, viewing_id, token, token_ciphertext, capability, status, expires_at, password_hash, access_version, created_at, updated_at, revoked_at, closed_at, last_resolved_at, published_snapshot, media_manifest",
    )
    .in("id", linkIds);
  if (linkError) throw linkError;
  const byId = new Map(
    ((links ?? []) as ShareLinkRow[]).map((link) => [link.id, link]),
  );

  const q = input?.q?.trim().toLowerCase();
  const items: SavedShareListItem[] = [];
  for (const row of rows) {
    const link = byId.get(row.share_link_id);
    if (!link) continue;
    const address = addressFromSnapshot(link.published_snapshot) || "—";
    if (q && !address.toLowerCase().includes(q)) continue;
    const path = pathForRow(link);
    const coords = coordsFromSnapshot(link.published_snapshot);
    items.push({
      id: row.id,
      shareLinkId: link.id,
      address,
      urlPath: path.urlPath,
      status: linkStatus(link),
      savedAt: row.created_at,
      needsRegenerate: path.needsRegenerate,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    });
  }
  return items;
}

export async function deleteSavedShare(
  admin: SupabaseClient,
  userId: string,
  saveId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("share_saves")
    .delete()
    .eq("id", saveId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}
