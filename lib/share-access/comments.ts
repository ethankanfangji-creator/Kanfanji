import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { hashShareToken, isShareTokenFormat } from "./crypto";
import { fetchShareGateByTokenAdmin, gateFromViewing } from "./server";
import type { OwnerShareCommentListItem } from "./types";

export type ShareReportComment = {
  id: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  shareLinkId: string;
};

const COMMENT_COLUMNS = "id, viewing_id, share_link_id, author_label, body, created_at";

function rateLimitKey(ip: string, token: string): string {
  return createHash("sha256").update(`share-comment:${ip}:${token}`).digest("hex");
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
  author_label: string;
  body: string;
  created_at: string;
  share_link_id: string;
}): ShareReportComment {
  return {
    id: row.id,
    authorLabel: row.author_label,
    body: row.body,
    createdAt: row.created_at,
    shareLinkId: row.share_link_id,
  };
}

/** Active share gate for public comment read/write (password links need unlock). */
export async function resolveActiveShareForComments(
  token: string,
  unlocked = false,
): Promise<
  | { ok: true; viewingId: string; shareLinkId: string }
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
  return {
    ok: true,
    viewingId: gateRow.shareLink.viewing_id,
    shareLinkId: gateRow.shareLink.id,
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
    .select(COMMENT_COLUMNS)
    .eq("viewing_id", viewingId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error("LOAD_FAILED");
  return (data ?? []).map((row) => mapComment(row as Parameters<typeof mapComment>[0]));
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
      "id, viewing_id, share_link_id, author_label, body, created_at, viewings!inner(id, user_id, address)",
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
    viewings: { address: string } | { address: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const viewing = Array.isArray(row.viewings) ? row.viewings[0] : row.viewings;
    return {
      id: row.id,
      viewingId: row.viewing_id,
      address: (viewing?.address ?? "").trim() || "—",
      authorLabel: row.author_label,
      body: row.body,
      createdAt: row.created_at,
      shareLinkId: row.share_link_id,
    };
  });
}

export async function insertShareComment(input: {
  viewingId: string;
  shareLinkId: string;
  authorLabel: string;
  body: string;
  clientHash?: string | null;
}): Promise<ShareReportComment> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("share_report_comments")
    .insert({
      viewing_id: input.viewingId,
      share_link_id: input.shareLinkId,
      author_label: input.authorLabel,
      body: input.body,
      client_hash: input.clientHash ?? null,
    })
    .select(COMMENT_COLUMNS)
    .single();
  if (error || !data) throw new Error("COMMENT_FAILED");
  return mapComment(data as Parameters<typeof mapComment>[0]);
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

/** Test helper — fingerprint shape matches RPC key length. */
export function shareCommentRateLimitKey(ip: string, token: string): string {
  return rateLimitKey(ip, token);
}

export function shareCommentTokenFingerprint(token: string): string {
  return hashShareToken(token);
}
