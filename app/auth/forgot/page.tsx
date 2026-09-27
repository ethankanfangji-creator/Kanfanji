"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/components/I18nProvider";
import { requestPasswordReset } from "@/lib/auth/browser-auth";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function ForgotPasswordPage() {
  const { messages } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [feedback, setFeedback] = useState<"rate_limited" | "failed" | null>(null);

  const showEmailError = emailTouched && !isValidEmail(email);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setEmailTouched(true);
    setFeedback(null);
    if (!isValidEmail(email)) return;
    setBusy(true);
    try {
      const result = await requestPasswordReset(email.trim());
      if (result === "rate_limited") {
        setFeedback("rate_limited");
        return;
      }
      if (result === "failed") {
        setFeedback("failed");
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPageShell title={messages.authFlow.forgotTitle} body={messages.authFlow.forgotBody}>
      <LanguageSwitcher />
      {sent ? (
        <div className="mt-4">
          <p role="status" className="text-[13px] leading-[1.5] text-[#1A1A1A]">
            {messages.authFlow.forgotOk}
          </p>
          <Link
            href="/login"
            className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-black text-[14px] font-bold text-white"
          >
            {messages.authFlow.goToSignIn}
          </Link>
        </div>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="mt-4 space-y-3" noValidate>
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
          {feedback === "rate_limited" ? (
            <p role="alert" className="text-[12px] leading-[1.4] text-[#991B1B]">
              {messages.authFlow.rateLimited}
            </p>
          ) : null}
          {feedback === "failed" ? (
            <p role="alert" className="text-[12px] leading-[1.4] text-[#991B1B]">
              {messages.authFlow.genericError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="h-12 w-full rounded-full bg-black text-[14px] font-bold text-white disabled:opacity-60"
          >
            {busy ? messages.loginGate.processing : messages.authFlow.forgotSubmit}
          </button>
        </form>
      )}
    </AuthPageShell>
  );
}
