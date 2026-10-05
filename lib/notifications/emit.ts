import "server-only";
import type { Locale } from "@/lib/i18n/config";
import { createAdminClient } from "@/utils/supabase/admin";
import { buildNotificationCopy } from "./copy";
import {
  lookupUserIdByEmail,
  notifyQuietly,
  resolveUserEmail,
} from "./create";

function siteUrlFromEnv(fallbackOrigin?: string): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    fallbackOrigin?.trim() ||
    "https://kanfangji.app"
  );
}

/** Notify viewing owner about a new public share-report comment. */
export function emitShareCommentNotification(input: {
  viewingId: string;
  commentId: string;
  authorLabel: string;
  bodyPreview: string;
  locale?: Locale | null;
  siteUrl?: string;
}): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      const { data: viewing } = await admin
        .from("viewings")
        .select("user_id, address")
        .eq("id", input.viewingId)
        .maybeSingle();
      if (!viewing?.user_id) return;

      const address =
        typeof viewing.address === "string" && viewing.address.trim()
          ? viewing.address.trim()
          : "";
      const href = `/shares?viewingId=${encodeURIComponent(input.viewingId)}`;
      const siteUrl = siteUrlFromEnv(input.siteUrl);
      const copy = buildNotificationCopy({
        type: "share_comment",
        locale: input.locale,
        siteUrl,
        href,
        vars: {
          address: address || "—",
          author: input.authorLabel,
          excerpt: input.bodyPreview.slice(0, 120),
        },
      });
      const email = await resolveUserEmail(String(viewing.user_id));
      notifyQuietly({
        type: "share_comment",
        userId: String(viewing.user_id),
        email,
        title: copy.title,
        body: copy.body,
        href,
        dedupeKey: `share_comment:${input.commentId}`,
        channels: { inApp: true, email: Boolean(email) },
        payload: {
          viewingId: input.viewingId,
          commentId: input.commentId,
          emailSubject: copy.emailSubject,
          emailText: copy.emailText,
          emailHtml: copy.emailHtml,
        },
      });
    } catch (error) {
      console.error("[notifications] emitShareCommentNotification failed", error);
    }
  })();
}

/** Email invitee (+ in-app if they already have an account). */
export function emitInviteCreatedNotification(input: {
  viewingId: string;
  inviteId: string;
  inviteEmail: string;
  inviteUrl: string;
  actorUserId: string;
  locale?: Locale | null;
  siteUrl?: string;
}): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      const { data: viewing } = await admin
        .from("viewings")
        .select("address")
        .eq("id", input.viewingId)
        .maybeSingle();
      const address =
        typeof viewing?.address === "string" && viewing.address.trim()
          ? viewing.address.trim()
          : "";
      const inviteeUserId = await lookupUserIdByEmail(input.inviteEmail);
      const hrefPath = new URL(input.inviteUrl).pathname + new URL(input.inviteUrl).search;
      const siteUrl = siteUrlFromEnv(input.siteUrl);
      const copy = buildNotificationCopy({
        type: "invite_created",
        locale: input.locale,
        siteUrl,
        href: hrefPath.startsWith("/") ? hrefPath : input.inviteUrl,
        vars: {
          address: address || "—",
        },
      });

      // Prefer absolute invite URL in email CTA.
      const emailCopy = buildNotificationCopy({
        type: "invite_created",
        locale: input.locale,
        siteUrl,
        href: input.inviteUrl,
        vars: { address: address || "—" },
      });

      notifyQuietly({
        type: "invite_created",
        userId: inviteeUserId,
        email: input.inviteEmail,
        actorUserId: input.actorUserId,
        title: copy.title,
        body: copy.body,
        href: hrefPath.startsWith("/") ? hrefPath : `/invite`,
        dedupeKey: `invite_created:${input.inviteId}`,
        channels: {
          inApp: Boolean(inviteeUserId),
          email: true,
        },
        payload: {
          viewingId: input.viewingId,
          inviteId: input.inviteId,
          emailSubject: emailCopy.emailSubject,
          emailText: emailCopy.emailText,
          emailHtml: emailCopy.emailHtml,
        },
      });
    } catch (error) {
      console.error("[notifications] emitInviteCreatedNotification failed", error);
    }
  })();
}

/** Notify owner when someone accepts a collaboration invite. */
export function emitInviteAcceptedNotification(input: {
  viewingId: string;
  inviteId: string;
  accepterUserId: string;
  accepterEmail: string;
  locale?: Locale | null;
  siteUrl?: string;
}): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      const [{ data: viewing }, { data: invite }] = await Promise.all([
        admin
          .from("viewings")
          .select("user_id, address")
          .eq("id", input.viewingId)
          .maybeSingle(),
        admin
          .from("viewing_invites")
          .select("invited_by")
          .eq("id", input.inviteId)
          .maybeSingle(),
      ]);

      const ownerId =
        (typeof viewing?.user_id === "string" && viewing.user_id) ||
        (typeof invite?.invited_by === "string" && invite.invited_by) ||
        null;
      if (!ownerId) return;
      if (ownerId === input.accepterUserId) return;

      const address =
        typeof viewing?.address === "string" && viewing.address.trim()
          ? viewing.address.trim()
          : "";
      const href = `/viewings/${encodeURIComponent(input.viewingId)}`;
      const siteUrl = siteUrlFromEnv(input.siteUrl);
      const copy = buildNotificationCopy({
        type: "invite_accepted",
        locale: input.locale,
        siteUrl,
        href,
        vars: {
          address: address || "—",
          email: input.accepterEmail,
        },
      });
      const email = await resolveUserEmail(ownerId);
      notifyQuietly({
        type: "invite_accepted",
        userId: ownerId,
        email,
        actorUserId: input.accepterUserId,
        title: copy.title,
        body: copy.body,
        href,
        dedupeKey: `invite_accepted:${input.inviteId}`,
        channels: { inApp: true, email: Boolean(email) },
        payload: {
          viewingId: input.viewingId,
          inviteId: input.inviteId,
          emailSubject: copy.emailSubject,
          emailText: copy.emailText,
          emailHtml: copy.emailHtml,
        },
      });
    } catch (error) {
      console.error("[notifications] emitInviteAcceptedNotification failed", error);
    }
  })();
}
