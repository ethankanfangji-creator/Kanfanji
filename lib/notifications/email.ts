import "server-only";
import { Resend } from "resend";

export type NotificationEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type NotificationEmailAdapter = {
  send(message: NotificationEmailMessage): Promise<"sent" | "skipped" | "failed">;
};

function fromAddress(): string | null {
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  return from || null;
}

export function createResendEmailAdapter(): NotificationEmailAdapter {
  return {
    async send(message) {
      const apiKey = process.env.RESEND_API_KEY?.trim();
      const from = fromAddress();
      if (!apiKey || !from) {
        console.info("[notifications] email skipped: RESEND_API_KEY or RESEND_FROM_EMAIL unset");
        return "skipped";
      }
      try {
        const resend = new Resend(apiKey);
        const { error } = await resend.emails.send({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        if (error) {
          console.error("[notifications] email send failed", error);
          return "failed";
        }
        return "sent";
      } catch (error) {
        console.error("[notifications] email send threw", error);
        return "failed";
      }
    },
  };
}

let adapter: NotificationEmailAdapter | null = null;

export function getNotificationEmailAdapter(): NotificationEmailAdapter {
  if (!adapter) adapter = createResendEmailAdapter();
  return adapter;
}

/** Test helper */
export function setNotificationEmailAdapterForTests(
  next: NotificationEmailAdapter | null,
): void {
  adapter = next;
}
