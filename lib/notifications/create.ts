import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { getNotificationEmailAdapter } from "./email";
import { getNotificationPreferences } from "./prefs";
import type {
  CreateNotificationInput,
  NotificationEmailStatus,
  NotificationItem,
} from "./types";

export type CreateNotificationResult = {
  skipped: boolean;
  reason?:
    | "actor_is_recipient"
    | "no_channels"
    | "no_recipient"
    | "dedupe"
    | "error";
  notification?: NotificationItem;
  emailStatus: NotificationEmailStatus;
};

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

/**
 * Create an in-app notification and/or send email.
 * Never throws to callers that fire-and-forget; returns structured result.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<CreateNotificationResult> {
  try {
    const inApp = input.channels.inApp === true;
    const emailWanted = input.channels.email === true;
    if (!inApp && !emailWanted) {
      return { skipped: true, reason: "no_channels", emailStatus: "skipped" };
    }

    const userId = input.userId?.trim() || null;
    const email = input.email?.trim().toLowerCase() || null;
    const actorUserId = input.actorUserId?.trim() || null;

    if (userId && actorUserId && userId === actorUserId) {
      return { skipped: true, reason: "actor_is_recipient", emailStatus: "skipped" };
    }

    if (inApp && !userId && !emailWanted) {
      return { skipped: true, reason: "no_recipient", emailStatus: "skipped" };
    }
    if (!inApp && emailWanted && !email) {
      return { skipped: true, reason: "no_recipient", emailStatus: "skipped" };
    }
    if (inApp && !userId) {
      // Fall through to email-only if requested.
      if (!emailWanted || !email) {
        return { skipped: true, reason: "no_recipient", emailStatus: "skipped" };
      }
    }

    let emailStatus: NotificationEmailStatus = "skipped";
    let shouldEmail = emailWanted && Boolean(email);
    if (shouldEmail && userId) {
      const prefs = await getNotificationPreferences(userId);
      if (!prefs.emailEnabled) shouldEmail = false;
    }

    const admin = createAdminClient();
    let notification: NotificationItem | undefined;

    if (inApp && userId) {
      const row = {
        user_id: userId,
        type: input.type,
        title: input.title.slice(0, 200),
        body: (input.body ?? "").slice(0, 2000),
        href: input.href ?? null,
        payload: input.payload ?? {},
        dedupe_key: input.dedupeKey ?? null,
        email_status: shouldEmail ? "queued" : "skipped",
      };
      const { data, error } = await admin
        .from("notifications")
        .insert(row)
        .select(
          "id, type, title, body, href, payload, read_at, email_status, created_at",
        )
        .maybeSingle();

      if (error) {
        // Unique dedupe conflict → treat as skip (already notified).
        if (error.code === "23505") {
          return { skipped: true, reason: "dedupe", emailStatus: "skipped" };
        }
        console.error("[notifications] insert failed", error);
        return { skipped: true, reason: "error", emailStatus: "failed" };
      }
      if (data) notification = mapRow(data as Parameters<typeof mapRow>[0]);
    }

    if (shouldEmail && email) {
      const adapter = getNotificationEmailAdapter();
      const subject =
        typeof input.payload?.emailSubject === "string"
          ? input.payload.emailSubject
          : input.title;
      const text =
        typeof input.payload?.emailText === "string"
          ? input.payload.emailText
          : `${input.body ?? input.title}`;
      const html =
        typeof input.payload?.emailHtml === "string"
          ? input.payload.emailHtml
          : `<p>${escapeHtml(text)}</p>`;
      emailStatus = await adapter.send({ to: email, subject, text, html });

      if (notification) {
        await admin
          .from("notifications")
          .update({ email_status: emailStatus })
          .eq("id", notification.id);
        notification = { ...notification, emailStatus };
      }
    }

    return {
      skipped: !notification && emailStatus === "skipped",
      notification,
      emailStatus,
    };
  } catch (error) {
    console.error("[notifications] createNotification failed", error);
    return { skipped: true, reason: "error", emailStatus: "failed" };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Fire-and-forget wrapper for route handlers. */
export function notifyQuietly(input: CreateNotificationInput): void {
  void createNotification(input).catch((error) => {
    console.error("[notifications] notifyQuietly failed", error);
  });
}

export async function lookupUserIdByEmail(email: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("lookup_auth_user_id_by_email", {
      p_email: email.trim().toLowerCase(),
    });
    if (error || data == null) return null;
    return typeof data === "string" ? data : null;
  } catch {
    return null;
  }
}

export async function resolveUserEmail(userId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(userId);
    return data.user?.email?.trim().toLowerCase() ?? null;
  } catch {
    return null;
  }
}
