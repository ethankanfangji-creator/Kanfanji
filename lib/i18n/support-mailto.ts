import { formatMessage } from "@/lib/i18n";

export type SupportMailtoCopy = {
  contactSupport: string;
  supportAccountGuest: string;
  supportAccountUser: string;
  supportDescribeIssue: string;
};

/**
 * Build a localized support mailto link (subject + body from the message dictionary).
 */
export function buildSupportMailto(opts: {
  locale: string;
  email?: string | null;
  copy: SupportMailtoCopy;
}): string {
  const to =
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@kanfangji.app";
  const subject = encodeURIComponent(
    `[Kanfangji] ${opts.copy.contactSupport} (${opts.locale})`,
  );
  const accountLine = opts.email
    ? formatMessage(opts.copy.supportAccountUser, { email: opts.email })
    : opts.copy.supportAccountGuest;
  const body = encodeURIComponent(
    [`Locale: ${opts.locale}`, accountLine, "", opts.copy.supportDescribeIssue, ""].join(
      "\n",
    ),
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}
