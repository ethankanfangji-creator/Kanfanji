import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { formatMessage, getMessages } from "@/lib/i18n";
import type { NotificationType } from "./types";

export type NotificationCopy = {
  title: string;
  body: string;
  emailSubject: string;
  emailText: string;
  emailHtml: string;
};

function absoluteUrl(href: string, siteUrl: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  const base = siteUrl.replace(/\/$/, "");
  return `${base}${href.startsWith("/") ? href : `/${href}`}`;
}

function wrapHtml(title: string, body: string, ctaLabel: string, url: string): string {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replace(/\n/g, "<br/>");
  const safeCta = escapeHtml(ctaLabel);
  const safeUrl = escapeHtml(url);
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p><strong>${safeTitle}</strong></p>
<p>${safeBody}</p>
<p><a href="${safeUrl}">${safeCta}</a></p>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildNotificationCopy(input: {
  type: NotificationType;
  locale?: Locale | null;
  siteUrl: string;
  href: string;
  vars?: Record<string, string | number>;
}): NotificationCopy {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const n = getMessages(locale).notifications;
  const vars = input.vars ?? {};
  const url = absoluteUrl(input.href, input.siteUrl);

  let title: string;
  let body: string;
  let emailSubject: string;

  switch (input.type) {
    case "share_comment":
      title = n.shareCommentTitle;
      body = formatMessage(n.shareCommentBody, vars);
      emailSubject = formatMessage(n.shareCommentEmailSubject, vars);
      break;
    case "invite_created":
      title = n.inviteCreatedTitle;
      body = formatMessage(n.inviteCreatedBody, vars);
      emailSubject = formatMessage(n.inviteCreatedEmailSubject, vars);
      break;
    case "invite_accepted":
      title = n.inviteAcceptedTitle;
      body = formatMessage(n.inviteAcceptedBody, vars);
      emailSubject = formatMessage(n.inviteAcceptedEmailSubject, vars);
      break;
    case "ask_ready":
      title = n.askReadyTitle;
      body = n.askReadyBody;
      emailSubject = n.askReadyEmailSubject;
      break;
    case "report_ready":
      title = n.reportReadyTitle;
      body = formatMessage(n.reportReadyBody, vars);
      emailSubject = formatMessage(n.reportReadyEmailSubject, vars);
      break;
    default: {
      const _exhaustive: never = input.type;
      void _exhaustive;
      title = n.genericTitle;
      body = n.genericBody;
      emailSubject = n.genericTitle;
    }
  }

  const emailText = `${body}\n\n${n.openLink}: ${url}`;
  const emailHtml = wrapHtml(title, body, n.openLink, url);
  return { title, body, emailSubject, emailText, emailHtml };
}
