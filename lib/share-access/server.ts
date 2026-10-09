import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateShareToken,
  hashShareToken,
  isShareTokenFormat,
} from "./crypto";
import { decryptShareToken, encryptShareToken } from "./token-vault";
import { assertChatShareExpiry } from "./chat-share-expiry";
import { chatShareExpiresAt, consumeShareCreateRateLimit } from "./share-rate-limit.server";
import type { OwnerShareLinkListItem, ShareLinkRecord } from "./types";
import { resolveShareLinkGate } from "./public-dto";
import {
  buildChatReportPublication,
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
  property: Record<string, unknown> | null;
  updated_at: string;
  created_at: string;
  report?: unknown;
  chat_state?: unknown;
  shareLink?: ShareLinkRow | null;
};

export type ShareLinkRow = {
  id: string;
  viewing_id: string;
  token: string | null;
  token_ciphertext?: string | null;
  capability: "read";
  status: "active" | "revoked";
  expires_at: string | null;
  password_hash: string | null;
  access_version: number;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  closed_at: string | null;
  last_resolved_at: string | null;
  published_snapshot: unknown;
  media_manifest: unknown;
};

const LINK_COLUMNS =
  "id, viewing_id, token, token_ciphertext, capability, status, expires_at, password_hash, access_version, created_at, updated_at, revoked_at, closed_at, last_resolved_at, published_snapshot, media_manifest";
const LINK_GATE_COLUMNS =
  "id, viewing_id, capability, status, expires_at, password_hash, access_version, created_at, updated_at, revoked_at, closed_at, last_resolved_at";

export type PublishedShareRow = {
  shareLink: ShareLinkRow;
  snapshot: PublishedShareSnapshot | import("./publication").AnyChatReportShareSnapshot;
  mediaManifest: PublishedShareMediaItem[];
  ownerId: string;
};

export type ShareGateRow = {
  shareLink: ShareLinkRow;
};

function publicPathForRow(row: ShareLinkRow): { urlPath: string; needsRegenerate: boolean } {
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

function coordsFromPublishedSnapshot(
  snapshot: unknown,
): { lat: number; lng: number } | null {
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

export function toShareLinkRecord(row: ShareLinkRow): ShareLinkRecord {
  const expired =
    row.expires_at && new Date(row.expires_at).getTime() <= Date.now();
  const status =
    row.status === "revoked"
      ? "revoked"
      : row.closed_at
        ? "closed"
        : expired
          ? "expired"
          : "active";
  return {
    id: row.id,
    viewingId: row.viewing_id,
    token: row.token ?? "",
    capability: "read",
    status,
    expiresAt: row.expires_at,
    passwordEnabled: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
    closedAt: row.closed_at,
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
      "id, user_id, address, tags, pros, risks, photo_urls, property, report, chat_state, updated_at, created_at",
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
): Promise<{ link: ShareLinkRecord | null; viewing: ViewingShareRow | null; urlPath: string; needsRegenerate: boolean }> {
  const viewing = await fetchOwnedViewing(supabase, userId, viewingId);
  if (!viewing) return { link: null, viewing: null, urlPath: "", needsRegenerate: false };
  const { data, error } = await supabase
    .from("share_links")
    .select(LINK_COLUMNS)
    .eq("viewing_id", viewingId)
    .eq("status", "active")
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  const row = data as ShareLinkRow | null;
  const path = row ? publicPathForRow(row) : { urlPath: "", needsRegenerate: false };
  return {
    link: row ? toShareLinkRecord(row) : null,
    viewing,
    ...path,
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

export type OwnerShareLinksFilter = {
  /** open = publicly accessible; closed = stopped (incl. legacy revoked); all */
  status?: "open" | "closed" | "all";
  q?: string;
  limit?: number;
};

/** Owner-wide share links joined to viewing address (for /shares hub). */
export async function listOwnerShareLinksAcrossViewings(
  supabase: SupabaseClient,
  userId: string,
  options?: OwnerShareLinksFilter,
): Promise<OwnerShareLinkListItem[]> {
  const status = options?.status ?? "open";
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 200);
  const q = (options?.q ?? "").trim();

  let query = supabase
    .from("share_links")
    .select(
      "id, viewing_id, token, token_ciphertext, capability, status, expires_at, password_hash, access_version, created_at, updated_at, revoked_at, closed_at, last_resolved_at, published_snapshot, media_manifest, viewings!inner(id, user_id, address)",
    )
    .eq("viewings.user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status === "open") {
    query = query.eq("status", "active").is("revoked_at", null).is("closed_at", null);
  } else if (status === "closed") {
    query = query.or("closed_at.not.is.null,status.eq.revoked");
  }

  if (q) {
    query = query.ilike("viewings.address", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  type ViewingJoin = { id: string; user_id: string; address: string };
  return ((data ?? []) as unknown as Array<
    ShareLinkRow & { viewings: ViewingJoin | ViewingJoin[] | null }
  >).map((row) => {
    const viewing = Array.isArray(row.viewings) ? row.viewings[0] : row.viewings;
    const record = toShareLinkRecord(row);
    const path = publicPathForRow(row);
    const { token: _token, ...rest } = record;
    void _token;
    const coords = coordsFromPublishedSnapshot(row.published_snapshot);
    return {
      ...rest,
      address: (viewing?.address ?? "").trim() || "—",
      urlPath: path.urlPath,
      needsRegenerate: path.needsRegenerate,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    };
  });
}

export async function ensureOwnerShareLink(
  supabase: SupabaseClient,
  userId: string,
  viewingId: string,
  options?: {
    expiresAt?: string | null;
    rotateToken?: boolean;
  },
): Promise<{ link: ShareLinkRecord; urlPath: string; needsRegenerate?: boolean }> {
  const viewing = await fetchOwnedViewing(supabase, userId, viewingId);
  if (!viewing) throw new Error("VIEWING_NOT_FOUND");
  if (options) assertChatShareExpiry(viewing, options);

  if (options?.rotateToken) {
    const current = await getOwnerShareLink(supabase, userId, viewingId);
    if (current.link) return rotateOwnerShareLink(supabase, userId, current.link.id);
  }

  const current = await getOwnerShareLink(supabase, userId, viewingId);
  if (current.link) {
    const patch: { expiresAt?: string | null } = {};
    if (options && Object.hasOwn(options, "expiresAt")) patch.expiresAt = options.expiresAt ?? null;
    const link =
      Object.keys(patch).length > 0
        ? await updateOwnerShareLink(supabase, userId, current.link.id, patch)
        : current.link;
    return { link, urlPath: current.urlPath, needsRegenerate: current.needsRegenerate };
  }

  const token = generateShareToken();
  const linkId = crypto.randomUUID();
  let tokenCiphertext: string;
  try {
    tokenCiphertext = encryptShareToken(token, linkId);
  } catch {
    throw new Error("SHARE_UNAVAILABLE");
  }
  const useChatReport = Boolean(viewing.report || viewing.chat_state);
  const publication = useChatReport
    ? buildChatReportPublication({
        id: viewing.id,
        user_id: viewing.user_id,
        address: viewing.address,
        report: viewing.report,
        chat_state: viewing.chat_state,
        updated_at: viewing.updated_at,
        photo_urls: viewing.photo_urls,
        property: viewing.property,
      })
      : { snapshot: buildSharePublication(viewing).snapshot, mediaManifest: buildSharePublication(viewing).mediaManifest };
  if (!(await consumeShareCreateRateLimit(userId))) throw new Error("SHARE_RATE_LIMITED");
  const { data, error } = await supabase
    .from("share_links")
    .insert({
      id: linkId,
      viewing_id: viewingId,
      token: null,
      token_hash: hashShareToken(token),
      token_ciphertext: tokenCiphertext,
      token_key_id: "v1",
      expires_at:
        options && Object.hasOwn(options, "expiresAt") ? options.expiresAt ?? null : null,
      password_hash: null,
      closed_at: null,
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

export async function setOwnerShareLinkClosed(
  supabase: SupabaseClient,
  userId: string,
  linkId: string,
  closed: boolean,
): Promise<ShareLinkRecord> {
  const { data, error } = await supabase.rpc("set_share_link_closed", {
    p_link_id: linkId,
    p_user_id: userId,
    p_closed: closed,
  });
  if (error) throw error;
  const next = (Array.isArray(data) ? data[0] : data) as ShareLinkRow | null;
  if (!next) throw new Error("LINK_NOT_FOUND");
  return toShareLinkRecord(next);
}

export async function republishOwnerShareLink(
  supabase: SupabaseClient,
  userId: string,
  linkId: string,
): Promise<{ link: ShareLinkRecord; urlPath: string; needsRegenerate: boolean }> {
  const row = await fetchOwnedLink(supabase, userId, linkId);
  if (!row || row.status !== "active") throw new Error("LINK_NOT_FOUND");
  const viewing = await fetchOwnedViewing(supabase, userId, row.viewing_id);
  if (!viewing) throw new Error("VIEWING_NOT_FOUND");
  const useChatReport = Boolean(viewing.report || viewing.chat_state);
  if (!useChatReport && !viewing.property) throw new Error("REPORT_NOT_READY");
  const publication = useChatReport
    ? buildChatReportPublication({
        id: viewing.id,
        user_id: viewing.user_id,
        address: viewing.address,
        report: viewing.report,
        chat_state: viewing.chat_state,
        updated_at: viewing.updated_at,
        photo_urls: viewing.photo_urls,
        property: viewing.property,
      })
    : buildSharePublication(viewing);
  if (!publication.snapshot) throw new Error("REPORT_NOT_READY");
  const { data, error } = await supabase.rpc("republish_share_link", {
    p_link_id: linkId,
    p_user_id: userId,
    p_snapshot: publication.snapshot,
    p_manifest: publication.mediaManifest,
  });
  if (error) throw error;
  const next = (Array.isArray(data) ? data[0] : data) as ShareLinkRow | null;
  if (!next) throw new Error("LINK_NOT_FOUND");
  const path = publicPathForRow(next);
  return {
    link: toShareLinkRecord(next),
    urlPath: path.urlPath,
    needsRegenerate: path.needsRegenerate,
  };
}

export async function updateOwnerShareLink(
  supabase: SupabaseClient,
  userId: string,
  linkId: string,
  patch: { expiresAt?: string | null },
): Promise<ShareLinkRecord> {
  const row = await fetchOwnedLink(supabase, userId, linkId);
  if (!row || row.status !== "active") throw new Error("LINK_NOT_FOUND");
  const viewing = await fetchOwnedViewing(supabase, userId, row.viewing_id);
  if (!viewing) throw new Error("LINK_NOT_FOUND");
  assertChatShareExpiry(viewing, patch);
  const setExpires = Object.hasOwn(patch, "expiresAt");
  if (!setExpires) return toShareLinkRecord(row);
  const { data, error } = await supabase.rpc("mutate_share_link_security", {
    p_link_id: linkId,
    p_user_id: userId,
    p_expected_access_version: row.access_version,
    p_set_expires: setExpires,
    p_expires_at: patch.expiresAt ?? null,
    p_set_password: false,
    p_password_hash: null,
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

function nextChatShareExpiry(chatState: unknown, currentExpiresAt: string | null) {
  if (!chatState) return currentExpiresAt;
  const cap = Date.parse(chatShareExpiresAt());
  const current = currentExpiresAt ? Date.parse(currentExpiresAt) : Number.NaN;
  if (!Number.isFinite(current)) return new Date(cap).toISOString();
  return new Date(Math.min(current, cap)).toISOString();
}

export async function rotateOwnerShareLink(
  supabase: SupabaseClient,
  userId: string,
  linkId: string,
): Promise<{ link: ShareLinkRecord; urlPath: string; needsRegenerate?: boolean }> {
  const row = await fetchOwnedLink(supabase, userId, linkId);
  if (!row || row.status !== "active") throw new Error("LINK_NOT_FOUND");
  const viewing = await fetchOwnedViewing(supabase, userId, row.viewing_id);
  if (!viewing) throw new Error("VIEWING_NOT_FOUND");
  const token = generateShareToken();
  const nextId = crypto.randomUUID();
  let tokenCiphertext: string;
  try {
    tokenCiphertext = encryptShareToken(token, nextId);
  } catch {
    throw new Error("SHARE_UNAVAILABLE");
  }
  const useChatReport = Boolean(viewing.report || viewing.chat_state);
  const publication = useChatReport
    ? buildChatReportPublication({
        id: viewing.id,
        user_id: viewing.user_id,
        address: viewing.address,
        report: viewing.report,
        chat_state: viewing.chat_state,
        updated_at: viewing.updated_at,
        photo_urls: viewing.photo_urls,
        property: viewing.property,
      })
    : buildSharePublication(viewing);
  if (!(await consumeShareCreateRateLimit(userId))) throw new Error("SHARE_RATE_LIMITED");
  const { data, error } = await supabase.rpc("rotate_chat_share_link", {
    p_old_id: linkId,
    p_user_id: userId,
    p_new_id: nextId,
    p_token_hash: hashShareToken(token),
    p_token_ciphertext: tokenCiphertext,
    p_expires_at: nextChatShareExpiry(
      useChatReport ? viewing.chat_state ?? {} : null,
      row.expires_at,
    ),
    p_snapshot: publication.snapshot,
    p_manifest: publication.mediaManifest,
  });
  if (error) throw error;
  const inserted = (Array.isArray(data) ? data[0] : data) as ShareLinkRow | null;
  if (!inserted) throw new Error("LINK_CONFLICT");
  return { link: toShareLinkRecord(inserted), urlPath: `/s/${token}` };
}

export async function fetchViewingByShareTokenAdmin(
  admin: SupabaseClient,
  token: string,
): Promise<PublishedShareRow | null> {
  const trimmed = token.trim();
  if (!isShareTokenFormat(trimmed)) return null;

  const { data, error } = await admin.rpc("resolve_share_publication_by_hash", {
    p_token_hash: hashShareToken(trimmed),
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
  if (!isShareTokenFormat(trimmed)) return null;
  const { data, error } = await admin
    .from("share_links")
    .select(LINK_GATE_COLUMNS)
    .eq("token_hash", hashShareToken(trimmed))
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
  _unlocked = false,
): ReturnType<typeof resolveShareLinkGate> {
  if (!viewing) return "missing";
  const access = viewing.shareLink;
  return resolveShareLinkGate({
    found: true,
    revokedAt: access?.status === "revoked" ? access.revoked_at || access.updated_at : null,
    closedAt: access?.closed_at ?? null,
    expiresAt: access?.expires_at ?? null,
    passwordHash: null,
    unlocked: false,
  });
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
