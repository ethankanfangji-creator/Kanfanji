"use client";

import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  useEmailCooldown,
  type CooldownPurpose,
} from "@/lib/auth/email-cooldown";
import type { ResendSignupResult } from "@/lib/auth/auth-flow";
import { authTextLink } from "./auth-styles";

export function ResendVerificationButton({
  email,
  label,
  purpose = "signup",
  className,
  onResend,
}: {
  email: string;
  label: "signup" | "confirm" | "reset";
  purpose?: CooldownPurpose;
  className?: string;
  onResend: (email: string) => Promise<ResendSignupResult>;
}) {
  const { messages, t } = useI18n();
  const { remaining, cooling, start } = useEmailCooldown(purpose, email);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<"ok" | "failed" | null>(null);
  const [limitNotice, setLimitNotice] = useState(false);

  if (!cooling && limitNotice) setLimitNotice(false);

  const idleLabel =
    label === "confirm"
      ? messages.authFlow.resendVerification
      : label === "reset"
        ? messages.authFlow.resendReset
        : messages.authFlow.resendSignup;

  async function resend() {
    if (busy) return;
    if (cooling) {
      setLimitNotice(true);
      return;
    }
    setBusy(true);
    setLimitNotice(false);
    setFeedback(null);
    try {
      const result = await onResend(email.trim());
      if (result === "failed") {
        setFeedback("failed");
        return;
      }
      setFeedback("ok");
      start();
    } catch {
      setFeedback("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void resend()}
        disabled={busy}
        aria-disabled={cooling || undefined}
        className={authTextLink}
      >
        {cooling ? t(messages.authFlow.resendCooldown, { seconds: remaining }) : idleLabel}
      </button>
      {feedback === "ok" ? (
        <p role="status" className="text-[12px] leading-[1.4] text-[#6B7280]">
          {messages.authFlow.resendSignupStatus}
        </p>
      ) : null}
      {limitNotice ? (
        <p role="alert" className="text-[12px] leading-[1.4] text-[#991B1B]">
          {messages.authFlow.rateLimited}
        </p>
      ) : null}
      {feedback === "failed" ? (
        <p role="alert" className="text-[12px] leading-[1.4] text-[#991B1B]">
          {messages.authFlow.genericError}
        </p>
      ) : null}
    </div>
  );
}
