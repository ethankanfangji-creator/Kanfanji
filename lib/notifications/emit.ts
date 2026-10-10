import "server-only";
import type { Locale } from "@/lib/i18n/config";
import { shareCommentHash } from "@/lib/share-access/comment-anchor";
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

/** Notify viewing owner about a new public share-report comment (or reply). */
export function emitShareCommentNotification(input: {
  viewingId: string;
  shareLinkId: string;
  commentId: string;
  authorLabel: string;
  bodyPreview: string;
  /** When set, treat as a reply for owner copy + optional guest opt-in email. */
  parentId?: string | null;
  /** Public token for guest email deep link (optional). */
  shareToken?: string | null;
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
      const href = `/shares?viewingId=${encodeURIComponent(input.viewingId)}&commentId=${encodeURIComponent(input.commentId)}`;
      const siteUrl = siteUrlFromEnv(input.siteUrl);
      const isReply = Boolean(input.parentId);
      const commentHash = shareCommentHash(input.commentId);
      const type = isReply ? "share_comment_reply" : "share_comment";
      const copy = buildNotificationCopy({
        type,
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
        type,
        userId: String(viewing.user_id),
        email,
        title: copy.title,
        body: copy.body,
        href,
        dedupeKey: `share_comment:${input.commentId}`,
        channels: { inApp: true, email: Boolean(email) },
        payload: {
          viewingId: input.viewingId,
          shareLinkId: input.shareLinkId,
          commentId: input.commentId,
          parentId: input.parentId ?? null,
          emailSubject: copy.emailSubject,
          emailText: copy.emailText,
          emailHtml: copy.emailHtml,
        },
      });

      if (isReply && input.parentId) {
        let publicPath = input.shareToken?.trim()
          ? `/s/${input.shareToken.trim()}`
          : "";
        if (!publicPath) {
          const { data: link } = await admin
            .from("share_links")
            .select("id, token, token_ciphertext")
            .eq("id", input.shareLinkId)
            .maybeSingle();
          if (link) {
            try {
              const { decryptShareToken } = await import(
                "@/lib/share-access/token-vault"
              );
              if (
                typeof link.token_ciphertext === "string" &&
                link.token_ciphertext
              ) {
                publicPath = `/s/${decryptShareToken(link.token_ciphertext, String(link.id))}`;
              } else if (typeof link.token === "string" && link.token) {
                publicPath = `/s/${link.token}`;
              }
            } catch {
              publicPath = "";
            }
          }
        }
        const publicHref = publicPath
          ? `${publicPath}${commentHash}`
          : "/shares?tab=received";

        const ownerId = String(viewing.user_id);
        const { data: saves } = await admin
          .from("share_saves")
          .select("user_id")
          .eq("share_link_id", input.shareLinkId);
        const saverIds = [
          ...new Set(
            ((saves ?? []) as Array<{ user_id: string | null }>)
              .map((row) => row.user_id)
              .filter(
                (id): id is string =>
                  typeof id === "string" && id.length > 0 && id !== ownerId,
              ),
          ),
        ];
        const saverCopy = buildNotificationCopy({
          type: "share_comment_reply",
          locale: input.locale,
          siteUrl,
          href: publicHref,
          vars: {
            address: address || "—",
            author: input.authorLabel,
            excerpt: input.bodyPreview.slice(0, 120),
          },
        });
        for (const saverId of saverIds) {
          const saverEmail = await resolveUserEmail(saverId);
          notifyQuietly({
            type: "share_comment_reply",
            userId: saverId,
            email: saverEmail,
            title: saverCopy.title,
            body: saverCopy.body,
            href: publicHref,
            dedupeKey: `share_comment_reply_saver:${input.commentId}:${saverId}`,
            channels: { inApp: true, email: Boolean(saverEmail) },
            payload: {
              viewingId: input.viewingId,
              shareLinkId: input.shareLinkId,
              commentId: input.commentId,
              parentId: input.parentId,
              emailSubject: saverCopy.emailSubject,
              emailText: saverCopy.emailText,
              emailHtml: saverCopy.emailHtml,
            },
          });
        }

        const { findThreadRootNotifyEmail } = await import(
          "@/lib/share-access/comments"
        );
        const optedIn = await findThreadRootNotifyEmail(input.parentId);
        if (optedIn?.email) {
          const n = (await import("@/lib/i18n")).getMessages(
            input.locale ?? (await import("@/lib/i18n/config")).DEFAULT_LOCALE,
          ).notifications;
          const { formatMessage } = await import("@/lib/i18n");
          const guestVars = {
            address: address || "—",
            author: input.authorLabel,
            excerpt: input.bodyPreview.slice(0, 120),
          };
          const guestTitle = n.shareGuestReplyTitle;
          const guestBody = formatMessage(n.shareGuestReplyBody, guestVars);
          const guestSubject = formatMessage(
            n.shareGuestReplyEmailSubject,
            guestVars,
          );
          const abs = siteUrl.replace(/\/$/, "") + publicHref;
          const guestUserId = await lookupUserIdByEmail(optedIn.email);
          const guestInApp =
            Boolean(guestUserId) && !saverIds.includes(guestUserId!);
          notifyQuietly({
            type: "share_comment_reply",
            userId: guestInApp ? guestUserId : null,
            email: optedIn.email,
            title: guestTitle,
            body: guestBody,
            href: publicHref,
            dedupeKey: `share_comment_guest:${input.commentId}:${optedIn.commentId}`,
            channels: { inApp: guestInApp, email: true },
            payload: {
              viewingId: input.viewingId,
              shareLinkId: input.shareLinkId,
              commentId: input.commentId,
              emailSubject: guestSubject,
              emailText: `${guestBody}\n\n${n.openLink}: ${abs}`,
              emailHtml: `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111"><p><strong>${guestTitle}</strong></p><p>${guestBody}</p><p><a href="${abs}">${n.openLink}</a></p></body></html>`,
            },
          });
        }
      }
    } catch (error) {
      console.error("[notifications] emitShareCommentNotification failed", error);
    }
  })();
}

/** Notify users who saved a share when the owner republishes public content. */
export function emitShareContentUpdatedNotifications(input: {
  viewingId: string;
  shareLinkIds: string[];
  actorUserId: string;
  publishedAt: string;
  locale?: Locale | null;
  siteUrl?: string;
}): void {
  void (async () => {
    try {
      const linkIds = [...new Set(input.shareLinkIds.filter(Boolean))];
      if (linkIds.length === 0) return;

      const admin = createAdminClient();
      const [{ data: viewing }, { data: saves, error: savesError }] =
        await Promise.all([
          admin
            .from("viewings")
            .select("address")
            .eq("id", input.viewingId)
            .maybeSingle(),
          admin
            .from("share_saves")
            .select("user_id, share_link_id")
            .in("share_link_id", linkIds),
        ]);
      if (savesError) throw savesError;

      const saverIds = [
        ...new Set(
          ((saves ?? []) as Array<{ user_id: string | null }>)
            .map((row) => row.user_id)
            .filter(
              (id): id is string =>
                typeof id === "string" &&
                id.length > 0 &&
                id !== input.actorUserId,
            ),
        ),
      ];
      if (saverIds.length === 0) return;

      const address =
        typeof viewing?.address === "string" && viewing.address.trim()
          ? viewing.address.trim()
          : "";
      const href = "/shares?tab=received";
      const siteUrl = siteUrlFromEnv(input.siteUrl);
      const copy = buildNotificationCopy({
        type: "share_content_updated",
        locale: input.locale,
        siteUrl,
        href,
        vars: { address: address || "—" },
      });

      for (const userId of saverIds) {
        const email = await resolveUserEmail(userId);
        notifyQuietly({
          type: "share_content_updated",
          userId,
          email,
          actorUserId: input.actorUserId,
          title: copy.title,
          body: copy.body,
          href,
          dedupeKey: `share_content_updated:${input.viewingId}:${input.publishedAt}`,
          channels: { inApp: true, email: Boolean(email) },
          payload: {
            viewingId: input.viewingId,
            publishedAt: input.publishedAt,
            emailSubject: copy.emailSubject,
            emailText: copy.emailText,
            emailHtml: copy.emailHtml,
          },
        });
      }
    } catch (error) {
      console.error(
        "[notifications] emitShareContentUpdatedNotifications failed",
        error,
      );
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
