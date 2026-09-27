"use client";

import { useEffect, useState } from "react";
import { resendSignupEmail } from "@/lib/auth/browser-auth";
import type { ResendSignupResult } from "@/lib/auth/auth-flow";
import { useI18n } from "@/components/I18nProvider";

const COOLDOWN_SECONDS = 60;

export function ResendVerificationButton({
  email,
  label,
  className,
  onResend = resendSignupEmail,
}: {
  email: string;
  label: "signup" | "confirm";
  className?: string;
  onResend?: (email: string) => Promise<ResendSignupResult>;
}) {
  const { messages, t } = useI18n();
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<"ok" | "rate_limited" | "failed" | null>(null);

  useEffect(() => {
    if (until == null) return;
    const id = window.setInterval(() => {
      const next = Date.now();
      if (next >= until) {
        setUntil(null);
        return;
      }
      setNow(next);
    }, 250);
    return () => window.clearInterval(id);
  }, [until]);

  const remaining = until == null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
  const cooling = remaining > 0;
  const buttonLabel =
    label === "signup" ? messages.authFlow.resendSignup : messages.authFlow.resendVerification;

  async function resend() {
    if (cooling || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await onResend(email.trim());
      if (result === "failed") {
        setFeedback("failed");
        return;
      }
      setFeedback(result === "rate_limited" ? "rate_limited" : "ok");
      const started = Date.now();
      setNow(started);
      setUntil(started + COOLDOWN_SECONDS * 1000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void resend()}
        disabled={busy || cooling}
        className="inline-flex min-h-11 items-center text-[12px] font-bold text-[#1A1A1A] underline-offset-2 hover:underline disabled:text-[#9CA3AF] disabled:no-underline"
      >
        {cooling ? t(messages.authFlow.resendCooldown, { seconds: remaining }) : buttonLabel}
      </button>
      {feedback === "ok" ? (
        <p role="status" className="mt-1 text-[12px] leading-[1.4] text-[#6B7280]">
          {messages.authFlow.resendSignupStatus}
        </p>
      ) : null}
      {feedback === "rate_limited" ? (
        <p role="alert" className="mt-1 text-[12px] leading-[1.4] text-[#991B1B]">
          {messages.authFlow.rateLimited}
        </p>
      ) : null}
      {feedback === "failed" ? (
        <p role="alert" className="mt-1 text-[12px] leading-[1.4] text-[#991B1B]">
          {messages.authFlow.genericError}
        </p>
      ) : null}
    </div>
  );
}
