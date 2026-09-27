"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { ResendVerificationButton } from "@/components/auth/ResendVerificationButton";
import { authPrimaryButton, authTextLink } from "@/components/auth/auth-styles";
import { useI18n } from "@/components/I18nProvider";
import { requestPasswordReset } from "@/lib/auth/browser-auth";
import { emailCooldownRemaining, startEmailCooldown } from "@/lib/auth/email-cooldown";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function ForgotPasswordPage() {
  const { messages } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [failed, setFailed] = useState(false);

  const showEmailError = emailTouched && !isValidEmail(email);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setEmailTouched(true);
    setFailed(false);
    if (!isValidEmail(email)) return;
    const trimmed = email.trim();
    if ((await emailCooldownRemaining("recovery", trimmed)) > 0) {
      setSent(true);
      return;
    }
    setBusy(true);
    try {
      const result = await requestPasswordReset(trimmed);
      if (result === "failed") {
        setFailed(true);
        return;
      }
      await startEmailCooldown("recovery", trimmed);
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPageShell title={messages.authFlow.forgotTitle} body={sent ? undefined : messages.authFlow.forgotBody}>
      {sent ? (
        <div className="space-y-3">
          <p role="status" className="text-[13px] leading-[1.5] text-[#1A1A1A]">
            {messages.authFlow.forgotOk}
          </p>
          <ResendVerificationButton
            email={email}
            label="reset"
            purpose="recovery"
            onResend={requestPasswordReset}
          />
          <button type="button" className={authTextLink} onClick={() => setSent(false)}>
            {messages.authFlow.useAnotherEmail}
          </button>
          <Link href="/login" className={authPrimaryButton}>
            {messages.authFlow.goToSignIn}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
          <div className="block text-[12px] font-bold">
            <label htmlFor="email">{messages.loginGate.email}</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              maxLength={320}
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => setEmailTouched(true)}
              aria-invalid={showEmailError || undefined}
              className="mt-1.5 h-12 w-full rounded-full border border-black/5 bg-[#F8F4EF] px-4 text-[16px] outline-none"
            />
            {showEmailError ? (
              <p className="mt-1.5 text-[11px] font-medium text-[#991B1B]">
                {messages.loginGate.emailInvalid}
              </p>
            ) : null}
          </div>
          {failed ? (
            <p role="alert" className="text-[12px] leading-[1.4] text-[#991B1B]">
              {messages.authFlow.genericError}
            </p>
          ) : null}
          <button type="submit" disabled={busy} className={authPrimaryButton}>
            {busy ? messages.loginGate.processing : messages.authFlow.forgotSubmit}
          </button>
        </form>
      )}
    </AuthPageShell>
  );
}
