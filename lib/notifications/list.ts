import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEmailStatus, NotificationItem } from "./types";

function mapRow(row: {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  email_status: string;
  created_at: string;
}): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    payload:
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? row.payload
        : {},
    readAt: row.read_at,
    emailStatus: row.email_status as NotificationEmailStatus,
    createdAt: row.created_at,
  };
}

const SELECT =
  "id, type, title, body, href, payload, read_at, email_status, created_at";

export async function listNotificationsForUser(
  supabase: SupabaseClient,
  userId: string,
  options?: { limit?: number },
): Promise<{ items: NotificationItem[]; unreadCount: number }> {
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);

  const [{ data, error }, unread] = await Promise.all([
    supabase
      .from("notifications")
      .select(SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null),
  ]);

  if (error) throw new Error("LOAD_FAILED");

  return {
    items: (data ?? []).map((row) => mapRow(row as Parameters<typeof mapRow>[0])),
    unreadCount: unread.count ?? 0,
  };
}

export async function markNotificationsRead(
  supabase: SupabaseClient,
  userId: string,
  input: { ids?: string[]; all?: boolean },
): Promise<{ updated: number }> {
  const now = new Date().toISOString();

  if (input.all) {
    const { data, error } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", userId)
      .is("read_at", null)
      .select("id");
    if (error) throw new Error("UPDATE_FAILED");
    return { updated: data?.length ?? 0 };
  }

  const ids = (input.ids ?? []).filter((id) => typeof id === "string" && id.length > 0);
  if (ids.length === 0) return { updated: 0 };

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", userId)
    .in("id", ids)
    .is("read_at", null)
    .select("id");
  if (error) throw new Error("UPDATE_FAILED");
  return { updated: data?.length ?? 0 };
}
