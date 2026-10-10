export const NOTIFICATION_TYPES = [
  "share_comment",
  "share_comment_reply",
  "share_content_updated",
  "invite_created",
  "invite_accepted",
  "ask_ready",
  "report_ready",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationEmailStatus = "skipped" | "queued" | "sent" | "failed";

export type NotificationChannels = {
  inApp: boolean;
  email: boolean;
};

export type NotificationItem = {
  id: string;
  type: NotificationType | string;
  title: string;
  body: string;
  href: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  emailStatus: NotificationEmailStatus;
  createdAt: string;
};

export type CreateNotificationInput = {
  type: NotificationType;
  title: string;
  body?: string;
  href?: string | null;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
  /** In-app recipient. Required when channels.inApp. */
  userId?: string | null;
  /** Email recipient. Required when channels.email. */
  email?: string | null;
  /** Skip entirely when recipient is the acting user (on-page actor rule). */
  actorUserId?: string | null;
  channels: NotificationChannels;
};
