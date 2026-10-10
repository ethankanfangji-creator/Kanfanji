import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accountFaceFromUser } from "@/lib/auth/account-face";
import { createAdminClient } from "@/utils/supabase/admin";
import { hashShareToken, isShareTokenFormat } from "./crypto";
import { fetchShareGateByTokenAdmin, gateFromViewing } from "./server";
import {
  decryptCommentNotifyEmail,
  encryptCommentNotifyEmail,
} from "./token-vault";
import type { OwnerShareCommentListItem } from "./types";

export type ShareCommentAuthorKind = "guest" | "owner";

export type ShareReportComment = {
  id: string;
  viewingId: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  shareLinkId: string;
  parentId: string | null;
  authorKind: ShareCommentAuthorKind;
  depth: number;
  recipientLabel?: string | null;
};

const COMMENT_COLUMNS =
  "id, viewing_id, share_link_id, author_label, body, created_at, parent_id, author_kind, depth";

function rateLimitKey(ip: string, token: string): string {
  return createHash("sha256").update(`share-comment:${ip}:${token}`).digest("hex");
}

function recipientFromJoin(
  link:
    | { recipient_label: string | null }
    | { recipient_label: string | null }[]
    | null
    | undefined,
): string | null {
  const row = Array.isArray(link) ? link[0] : link;
  const label =
    typeof row?.recipient_label === "string" ? row.recipient_label.trim() : "";
  return label || null;
}

function asAuthorKind(raw: unknown): ShareCommentAuthorKind {
  return raw === "owner" ? "owner" : "guest";
}

export async function consumeShareCommentRateLimit(
  ip: string,
  token: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_share_comment_attempt", {
    p_key: rateLimitKey(ip, token),
  });
  if (error || !data) throw new Error("SHARE_UNAVAILABLE");
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.allowed === true) return { ok: true };
  return {
    ok: false,
    retryAfterSec: Math.max(1, Number(row?.retry_after_seconds) || 60),
  };
}

function mapComment(row: {
  id: string;
  viewing_id?: string;
  author_label: string;
  body: string;
  created_at: string;
  share_link_id: string;
  parent_id?: string | null;
  author_kind?: string | null;
  depth?: number | null;
}): ShareReportComment {
  return {
    id: row.id,
    viewingId: typeof row.viewing_id === "string" ? row.viewing_id : "",
    authorLabel: row.author_label,
    body: row.body,
    createdAt: row.created_at,
    shareLinkId: row.share_link_id,
    parentId: typeof row.parent_id === "string" ? row.parent_id : null,
    authorKind: asAuthorKind(row.author_kind),
    depth: typeof row.depth === "number" && Number.isFinite(row.depth) ? row.depth : 0,
  };
}

/** Active share gate for public comment read/write (password links need unlock). */
export async function resolveActiveShareForComments(
  token: string,
  unlocked = false,
): Promise<
  | { ok: true; viewingId: string; shareLinkId: string; recipientLabel: string | null }
  | {
      ok: false;
      status: "missing" | "revoked" | "closed" | "expired" | "password_required" | "forbidden";
    }
> {
  if (!isShareTokenFormat(token)) return { ok: false, status: "missing" };
  const admin = createAdminClient();
  const gateRow = await fetchShareGateByTokenAdmin(admin, token);
  const gate = gateFromViewing(gateRow, unlocked);
  if (gate !== "active" || !gateRow) {
    if (
      gate === "revoked" ||
      gate === "closed" ||
      gate === "expired" ||
      gate === "password_required" ||
      gate === "missing"
    ) {
      return { ok: false, status: gate };
    }
    return { ok: false, status: "forbidden" };
  }
  const raw = gateRow.shareLink.recipient_label;
  const recipientLabel =
    typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 40) : null;
  return {
    ok: true,
    viewingId: gateRow.shareLink.viewing_id,
    shareLinkId: gateRow.shareLink.id,
    recipientLabel,
  };
}

export async function listShareCommentsForLink(
  shareLinkId: string,
): Promise<ShareReportComment[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("share_report_comments")
    .select(COMMENT_COLUMNS)
    .eq("share_link_id", shareLinkId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error("LOAD_FAILED");
  return (data ?? []).map((row) => mapComment(row as Parameters<typeof mapComment>[0]));
}

export async function listShareCommentsForViewing(
  viewingId: string,
): Promise<ShareReportComment[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("share_report_comments")
    .select(`${COMMENT_COLUMNS}, share_links(recipient_label)`)
    .eq("viewing_id", viewingId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error("LOAD_FAILED");
  return (data ?? []).map((row) => {
    const base = mapComment(row as Parameters<typeof mapComment>[0]);
    return {
      ...base,
      recipientLabel: recipientFromJoin(
        (row as { share_links?: Parameters<typeof recipientFromJoin>[0] }).share_links,
      ),
    };
  });
}

/** Batch load comments for many viewings (oldest first per home, capped later by corpus). */
export async function listShareCommentsForViewings(
  viewingIds: string[],
): Promise<Record<string, ShareReportComment[]>> {
  const ids = [...new Set(viewingIds.map((id) => id.trim()).filter(Boolean))].slice(0, 40);
  const out: Record<string, ShareReportComment[]> = {};
  for (const id of ids) out[id] = [];
  if (ids.length === 0) return out;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("share_report_comments")
    .select(COMMENT_COLUMNS)
    .in("viewing_id", ids)
    .order("created_at", { ascending: true })
    .limit(2_000);
  if (error) throw new Error("LOAD_FAILED");

  for (const row of data ?? []) {
    const mapped = mapComment(row as Parameters<typeof mapComment>[0] & { viewing_id?: string });
    const viewingId =
      typeof (row as { viewing_id?: string }).viewing_id === "string"
        ? (row as { viewing_id: string }).viewing_id
        : "";
    if (!viewingId || !(viewingId in out)) continue;
    out[viewingId].push(mapped);
  }
  return out;
}

/** Return viewing ids the user owns (intersection with requested). */
export async function filterOwnedViewingIds(
  supabase: SupabaseClient,
  userId: string,
  viewingIds: string[],
): Promise<string[]> {
  const ids = [...new Set(viewingIds.map((id) => id.trim()).filter(Boolean))].slice(0, 40);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("viewings")
    .select("id")
    .eq("user_id", userId)
    .in("id", ids);
  if (error || !data) return [];
  return data.map((row) => row.id as string);
}

/** Owner-wide share comments (survives revoked links), newest first. */
export async function listOwnerShareCommentsAcrossViewings(
  supabase: SupabaseClient,
  userId: string,
  options?: { q?: string; viewingId?: string; limit?: number },
): Promise<OwnerShareCommentListItem[]> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 200);
  const q = (options?.q ?? "").trim();
  const viewingId = options?.viewingId?.trim();

  let query = supabase
    .from("share_report_comments")
    .select(
      "id, viewing_id, share_link_id, author_label, body, created_at, parent_id, author_kind, depth, viewings!inner(id, user_id, address), share_links(recipient_label)",
    )
    .eq("viewings.user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (viewingId) {
    query = query.eq("viewing_id", viewingId);
  }
  if (q) {
    query = query.ilike("viewings.address", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error("LOAD_FAILED");

  type Row = {
    id: string;
    viewing_id: string;
    share_link_id: string;
    author_label: string;
    body: string;
    created_at: string;
    parent_id: string | null;
    author_kind: string | null;
    depth: number | null;
    viewings: { address: string } | { address: string }[] | null;
    share_links:
      | { recipient_label: string | null }
      | { recipient_label: string | null }[]
      | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const viewing = Array.isArray(row.viewings) ? row.viewings[0] : row.viewings;
    const link = Array.isArray(row.share_links) ? row.share_links[0] : row.share_links;
    const label =
      typeof link?.recipient_label === "string" ? link.recipient_label.trim() : "";
    return {
      id: row.id,
      viewingId: row.viewing_id,
      address: (viewing?.address ?? "").trim() || "—",
      authorLabel: row.author_label,
      body: row.body,
      createdAt: row.created_at,
      shareLinkId: row.share_link_id,
      recipientLabel: label || null,
      parentId: typeof row.parent_id === "string" ? row.parent_id : null,
      authorKind: asAuthorKind(row.author_kind),
      depth: typeof row.depth === "number" ? row.depth : 0,
    };
  });
}

export async function deleteOwnerShareComment(
  supabase: SupabaseClient,
  userId: string,
  commentId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data: row, error: loadError } = await admin
    .from("share_report_comments")
    .select("id, viewing_id")
    .eq("id", commentId)
    .maybeSingle();
  if (loadError) throw new Error("LOAD_FAILED");
  if (!row?.viewing_id) return false;
  const owned = await assertOwnedViewing(supabase, userId, row.viewing_id as string);
  if (!owned) return false;
  const { error } = await admin
    .from("share_report_comments")
    .delete()
    .eq("id", commentId);
  if (error) throw new Error("DELETE_FAILED");
  return true;
}

type ParentRow = {
  id: string;
  viewing_id: string;
  share_link_id: string;
  depth: number;
  parent_id: string | null;
};

async function loadParentComment(
  admin: ReturnType<typeof createAdminClient>,
  parentId: string,
): Promise<ParentRow | null> {
  const { data, error } = await admin
    .from("share_report_comments")
    .select("id, viewing_id, share_link_id, depth, parent_id")
    .eq("id", parentId)
    .maybeSingle();
  if (error) throw new Error("LOAD_FAILED");
  if (!data) return null;
  return data as ParentRow;
}

type NotifyEmailWalkRow = {
  id: string;
  parent_id: string | null;
  notify_email_ciphertext: string | null;
};

/** Walk to thread root for guest notify email lookup. */
export async function findThreadRootNotifyEmail(
  startCommentId: string,
): Promise<{ commentId: string; email: string } | null> {
  const admin = createAdminClient();
  let currentId: string | null = startCommentId;
  for (let i = 0; i < 10 && currentId; i += 1) {
    const { data, error } = await admin
      .from("share_report_comments")
      .select("id, parent_id, notify_email_ciphertext")
      .eq("id", currentId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as NotifyEmailWalkRow;
    const parentId: string | null =
      typeof row.parent_id === "string" ? row.parent_id : null;
    if (!parentId) {
      const sealed =
        typeof row.notify_email_ciphertext === "string"
          ? row.notify_email_ciphertext
          : null;
      if (!sealed) return null;
      try {
        return {
          commentId: row.id,
          email: decryptCommentNotifyEmail(sealed, row.id),
        };
      } catch {
        return null;
      }
    }
    currentId = parentId;
  }
  return null;
}

export async function insertShareComment(input: {
  viewingId: string;
  shareLinkId: string;
  authorLabel: string;
  body: string;
  clientHash?: string | null;
  parentId?: string | null;
  authorKind?: ShareCommentAuthorKind;
  notifyEmail?: string | null;
}): Promise<ShareReportComment> {
  const admin = createAdminClient();
  const parentId = input.parentId?.trim() || null;
  if (parentId) {
    const parent = await loadParentComment(admin, parentId);
    if (!parent) throw new Error("PARENT_NOT_FOUND");
    if (
      parent.share_link_id !== input.shareLinkId ||
      parent.viewing_id !== input.viewingId
    ) {
      throw new Error("PARENT_MISMATCH");
    }
    if ((parent.depth ?? 0) >= 8) throw new Error("DEPTH_EXCEEDED");
  }

  const id = randomUUID();
  const notifyEmail = input.notifyEmail?.trim().toLowerCase() || null;
  let notifyCipher: string | null = null;
  if (notifyEmail) {
    notifyCipher = encryptCommentNotifyEmail(notifyEmail, id);
  }

  const { data, error } = await admin
    .from("share_report_comments")
    .insert({
      id,
      viewing_id: input.viewingId,
      share_link_id: input.shareLinkId,
      author_label: input.authorLabel,
      body: input.body,
      client_hash: input.clientHash ?? null,
      parent_id: parentId,
      author_kind: input.authorKind ?? "guest",
      notify_email_ciphertext: notifyCipher,
    })
    .select(COMMENT_COLUMNS)
    .single();
  if (error || !data) {
    const message = typeof error?.message === "string" ? error.message : "";
    if (message.includes("SHARE_COMMENT_DEPTH")) throw new Error("DEPTH_EXCEEDED");
    if (message.includes("SHARE_COMMENT_PARENT_MISMATCH")) throw new Error("PARENT_MISMATCH");
    if (message.includes("SHARE_COMMENT_PARENT_MISSING")) throw new Error("PARENT_NOT_FOUND");
    throw new Error("COMMENT_FAILED");
  }
  return mapComment(data as Parameters<typeof mapComment>[0]);
}

export async function insertOwnerShareReply(input: {
  supabase: SupabaseClient;
  userId: string;
  parentCommentId: string;
  body: string;
  ownerLabelFallback: string;
}): Promise<ShareReportComment> {
  const admin = createAdminClient();
  const parent = await loadParentComment(admin, input.parentCommentId);
  if (!parent) throw new Error("PARENT_NOT_FOUND");
  const owned = await assertOwnedViewing(
    input.supabase,
    input.userId,
    parent.viewing_id,
  );
  if (!owned) throw new Error("FORBIDDEN");
  if ((parent.depth ?? 0) >= 8) throw new Error("DEPTH_EXCEEDED");

  const { data: authData } = await input.supabase.auth.getUser();
  const face = accountFaceFromUser(authData.user, input.ownerLabelFallback);

  return insertShareComment({
    viewingId: parent.viewing_id,
    shareLinkId: parent.share_link_id,
    authorLabel: face.label.slice(0, 40) || input.ownerLabelFallback,
    body: input.body,
    parentId: parent.id,
    authorKind: "owner",
  });
}

export async function assertOwnedViewing(
  supabase: SupabaseClient,
  userId: string,
  viewingId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("viewings")
    .select("id")
    .eq("id", viewingId)
    .eq("user_id", userId)
    .maybeSingle();
  return !error && Boolean(data);
}

export function normalizeCommentAuthor(raw: unknown, fallback: string): string {
  const value =
    typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  return (value || fallback).slice(0, 40);
}

export function normalizeCommentBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const body = raw.trim();
  if (body.length < 1 || body.length > 500) return null;
  return body;
}

export function optionalClientHash(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^[a-f0-9]{64}$/i.test(raw)) return null;
  return raw.toLowerCase();
}

/** Optional guest notify email (opt-in). */
export function normalizeNotifyEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** Test helper — fingerprint shape matches RPC key length. */
export function shareCommentRateLimitKey(ip: string, token: string): string {
  return rateLimitKey(ip, token);
}

export function shareCommentTokenFingerprint(token: string): string {
  return hashShareToken(token);
}
