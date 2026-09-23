import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateShareToken,
  hashSharePassword,
  verifySharePassword,
} from "./crypto";
import type { ShareLinkRecord } from "./types";
import { resolveShareLinkGate } from "./public-dto";
import {
  buildSharePublication,
  isPublishedShareSnapshot,
  parseMediaManifest,
} from "./publication";
import type {
  PublishedShareMediaItem,
  PublishedShareSnapshot,
} from "./types";

export type ViewingShareRow = {
  id: string;
  user_id: string;
  address: string;
  tags: string[] | null;
  pros: string[] | null;
  risks: string[] | null;
  photo_urls: string[] | null;
  share_token: string | null;
  property: Record<string, unknown> | null;
  updated_at: string;
  created_at: string;
  shareLink?: ShareLinkRow | null;
};

export type ShareLinkRow = {
  id: string;
  viewing_id: string;
  token: string;
  capability: "read";
  status: "active" | "revoked";
  expires_at: string | null;
  password_hash: string | null;
  access_version: number;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  last_resolved_at: string | null;
  published_snapshot: unknown;
  media_manifest: unknown;
};

const LINK_COLUMNS =
  "id, viewing_id, token, capability, status, expires_at, password_hash, access_version, created_at, updated_at, revoked_at, last_resolved_at, published_snapshot, media_manifest";
const LINK_GATE_COLUMNS =
  "id, viewing_id, token, capability, status, expires_at, password_hash, access_version, created_at, updated_at, revoked_at, last_resolved_at";

export type PublishedShareRow = {
  shareLink: ShareLinkRow;
  snapshot: PublishedShareSnapshot;
  mediaManifest: PublishedShareMediaItem[];
  ownerId: string;
};

export type ShareGateRow = {
  shareLink: ShareLinkRow;
};

export function toShareLinkRecord(row: ShareLinkRow): ShareLinkRecord {
  const expired =
    row.expires_at && new Date(row.expires_at).getTime() <= Date.now();
  const status = row.status === "revoked" ? "revoked" : expired ? "expired" : "active";
  return {
    id: row.id,
    viewingId: row.viewing_id,
    token: row.token,
    capability: "read",
    status,
    expiresAt: row.expires_at,
    passwordEnabled: Boolean(row.password_hash),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
    lastResolvedAt: row.last_resolved_at,
    accessVersion: row.access_version,
  };
}

async function fetchOwnedViewing(
  supabase: SupabaseClient,
  userId: string,
  viewingId: string,
): Promise<ViewingShareRow | null> {
  const { data, error } = await supabase
    .from("viewings")
    .select(
      "id, user_id, address, tags, pros, risks, photo_urls, share_token, property, updated_at, created_at",
    )
    .eq("id", viewingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ViewingShareRow;
}

export async function getOwnerShareLink(
  supabase: SupabaseClient,
  userId: string,
  viewingId: string,
): Promise<{ link: ShareLinkRecord | null; viewing: ViewingShareRow | null }> {
  const viewing = await fetchOwnedViewing(supabase, userId, viewingId);
  if (!viewing) return { link: null, viewing: null };
  const { data, error } = await supabase
    .from("share_links")
    .select(LINK_COLUMNS)
    .eq("viewing_id", viewingId)
    .eq("status", "active")
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return {
    link: data ? toShareLinkRecord(data as ShareLinkRow) : null,
    viewing,
  };
}

export async function listOwnerShareLinks(
  supabase: SupabaseClient,
  userId: string,
  viewingId: string,
): Promise<ShareLinkRecord[]> {
  const viewing = await fetchOwnedViewing(supabase, userId, viewingId);
  if (!viewing) throw new Error("VIEWING_NOT_FOUND");
  const { data, error } = await supabase
    .from("share_links")
    .select(LINK_COLUMNS)
    .eq("viewing_id", viewingId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ShareLinkRow[]).map(toShareLinkRecord);
}

export async function ensureOwnerShareLink(
  supabase: SupabaseClient,
  userId: string,
  viewingId: string,
  options?: {
    expiresAt?: string | null;
    password?: string | null;
    rotateToken?: boolean;
  },
): Promise<{ link: ShareLinkRecord; urlPath: string }> {
  const viewing = await fetchOwnedViewing(supabase, userId, viewingId);
  if (!viewing) throw new Error("VIEWING_NOT_FOUND");

  if (options?.rotateToken) {
    const current = await getOwnerShareLink(supabase, userId, viewingId);
    if (current.link) return rotateOwnerShareLink(supabase, userId, current.link.id);
  }

  const current = await getOwnerShareLink(supabase, userId, viewingId);
  if (current.link) {
    const patch: { expiresAt?: string | null; password?: string | null } = {};
    if (options && Object.hasOwn(options, "expiresAt")) patch.expiresAt = options.expiresAt ?? null;
    if (options && Object.hasOwn(options, "password")) patch.password = options.password ?? null;
    const link =
      Object.keys(patch).length > 0
        ? await updateOwnerShareLink(supabase, userId, current.link.id, patch)
        : current.link;
    return { link, urlPath: `/s/${link.token}` };
  }

  const passwordHash =
    options && Object.hasOwn(options, "password") && options.password
      ? await hashSharePassword(options.password)
      : null;
  const token = generateShareToken();
  const publication = buildSharePublication(viewing);
  const { data, error } = await supabase
    .from("share_links")
    .insert({
      viewing_id: viewingId,
      token,
      expires_at:
        options && Object.hasOwn(options, "expiresAt") ? options.expiresAt ?? null : null,
      password_hash: passwordHash,
      published_snapshot: publication.snapshot,
      media_manifest: publication.mediaManifest,
    })
    .select(LINK_COLUMNS)
    .single();
  if (error) throw error;
  const link = toShareLinkRecord(data as ShareLinkRow);
  return {
    link,
    urlPath: `/s/${token}`,
  };
}

export async function updateOwnerShareLink(
  supabase: SupabaseClient,
  userId: string,
  linkId: string,
  patch: { expiresAt?: string | null; password?: string | null },
): Promise<ShareLinkRecord> {
  const row = await fetchOwnedLink(supabase, userId, linkId);
  if (!row || row.status !== "active") throw new Error("LINK_NOT_FOUND");
  const setExpires = Object.hasOwn(patch, "expiresAt");
  const setPassword = Object.hasOwn(patch, "password");
  if (!setExpires && !setPassword) return toShareLinkRecord(row);
  let passwordHash: string | null = null;
  if (Object.hasOwn(patch, "password")) {
    passwordHash = patch.password ? await hashSharePassword(patch.password) : null;
  }
  const { data, error } = await supabase.rpc("mutate_share_link_security", {
    p_link_id: linkId,
    p_user_id: userId,
    p_expected_access_version: row.access_version,
    p_set_expires: setExpires,
    p_expires_at: patch.expiresAt ?? null,
    p_set_password: setPassword,
    p_password_hash: passwordHash,
    p_revoke: false,
  });
  if (error) throw error;
  const next = (Array.isArray(data) ? data[0] : data) as ShareLinkRow | null;
  if (!next) throw new Error("LINK_CONFLICT");
  return toShareLinkRecord(next);
}

async function fetchOwnedLink(
  supabase: SupabaseClient,
  userId: string,
  linkId: string,
): Promise<ShareLinkRow | null> {
  const { data, error } = await supabase
    .from("share_links")
    .select(LINK_COLUMNS)
    .eq("id", linkId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as ShareLinkRow;
  return (await fetchOwnedViewing(supabase, userId, row.viewing_id)) ? row : null;
}

export async function revokeOwnerShareLink(
  supabase: SupabaseClient,
  userId: string,
  linkId: string,
): Promise<ShareLinkRecord> {
  const row = await fetchOwnedLink(supabase, userId, linkId);
  if (!row || row.status !== "active") throw new Error("LINK_NOT_FOUND");
  const { data, error } = await supabase.rpc("mutate_share_link_security", {
    p_link_id: linkId,
    p_user_id: userId,
    p_expected_access_version: row.access_version,
    p_set_expires: false,
    p_expires_at: null,
    p_set_password: false,
    p_password_hash: null,
    p_revoke: true,
  });
  if (error) throw error;
  const next = (Array.isArray(data) ? data[0] : data) as ShareLinkRow | null;
  if (!next) throw new Error("LINK_CONFLICT");
  return toShareLinkRecord(next);
}

export async function rotateOwnerShareLink(
  supabase: SupabaseClient,
  userId: string,
  linkId: string,
): Promise<{ link: ShareLinkRecord; urlPath: string }> {
  const row = await fetchOwnedLink(supabase, userId, linkId);
  if (!row || row.status !== "active") throw new Error("LINK_NOT_FOUND");
  const token = generateShareToken();
  const { data, error } = await supabase.rpc("rotate_share_link", {
    p_link_id: linkId,
    p_user_id: userId,
    p_token: token,
  });
  if (error) throw error;
  const next = (Array.isArray(data) ? data[0] : data) as ShareLinkRow | null;
  if (!next) throw new Error("LINK_NOT_FOUND");
  return { link: toShareLinkRecord(next), urlPath: `/s/${token}` };
}

export async function fetchViewingByShareTokenAdmin(
  admin: SupabaseClient,
  token: string,
): Promise<PublishedShareRow | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const { data, error } = await admin.rpc("resolve_share_publication", {
    p_token: trimmed,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const resolved = data as { shareLink?: unknown; ownerId?: unknown };
  if (!resolved.shareLink || typeof resolved.shareLink !== "object") return null;
  const linkRow = resolved.shareLink as ShareLinkRow;
  if (!isPublishedShareSnapshot(linkRow.published_snapshot)) return null;
  if (typeof resolved.ownerId !== "string") return null;
  return {
    shareLink: linkRow,
    snapshot: linkRow.published_snapshot,
    mediaManifest: parseMediaManifest(linkRow.media_manifest),
    ownerId: resolved.ownerId,
  };
}

/** Fetches access metadata only, so locked requests never read published content. */
export async function fetchShareGateByTokenAdmin(
  admin: SupabaseClient,
  token: string,
): Promise<ShareGateRow | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const { data, error } = await admin
    .from("share_links")
    .select(LINK_GATE_COLUMNS)
    .eq("token", trimmed)
    .maybeSingle();
  if (error || !data) return null;
  return { shareLink: data as ShareLinkRow };
}

export async function touchShareResolved(
  admin: SupabaseClient,
  viewing: PublishedShareRow | ShareGateRow,
): Promise<void> {
  const link = viewing.shareLink;
  if (!link || link.status !== "active") return;
  const now = new Date().toISOString();
  await admin
    .from("share_links")
    .update({ last_resolved_at: now })
    .eq("id", link.id)
    .eq("status", "active");
}

export function gateFromViewing(
  viewing: PublishedShareRow | ShareGateRow | null,
  unlocked: boolean,
): ReturnType<typeof resolveShareLinkGate> {
  if (!viewing) return "missing";
  const access = viewing.shareLink;
  return resolveShareLinkGate({
    found: true,
    revokedAt: access?.status === "revoked" ? access.revoked_at || access.updated_at : null,
    expiresAt: access?.expires_at ?? null,
    passwordHash: access?.password_hash ?? null,
    unlocked,
  });
}

export async function verifyViewingSharePassword(
  viewing: PublishedShareRow | ShareGateRow,
  password: string,
): Promise<boolean> {
  const hash = viewing.shareLink?.password_hash;
  if (!hash) return true;
  return verifySharePassword(password, hash);
}

export function getShareAccess(viewing: PublishedShareRow | ShareGateRow): ShareLinkRow {
  return viewing.shareLink;
}

/** @deprecated Share metadata now lives only in share_links. */
export function ensureShareAccessOnProperty(
  property: Record<string, unknown>,
  shareToken: string | null,
): Record<string, unknown> {
  void shareToken;
  return property;
}
