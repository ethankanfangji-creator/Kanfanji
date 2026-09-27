"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/components/I18nProvider";
import { claimGuestViewingData } from "@/lib/auth/claim-guest-data";
import { reportAuthFailure, type AuthFailureKind } from "@/lib/auth/auth-flow";
import { readRecoveryParams } from "@/lib/auth/recovery-params";
import { createClient } from "@/utils/supabase/client";

function PasswordField({
  id,
  label,
  value,
  autoComplete,
  showLabel,
  hideLabel,
  describedBy,
  invalid,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  showLabel: string;
  hideLabel: string;
  describedBy?: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="block text-[12px] font-bold">
      <label htmlFor={id}>{label}</label>
      <div className="relative mt-1.5">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          required
          minLength={6}
          maxLength={128}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="h-12 w-full rounded-full border border-black/5 bg-[#F8F4EF] px-4 pr-12 text-[16px] outline-none"
        />
        <button
          type="button"
          className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[#6B7280]"
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  const { messages } = useI18n();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [tooShort, setTooShort] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<AuthFailureKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Same-browser PKCE is exchanged inside the client during initialize, which
    // emits PASSWORD_RECOVERY and consumes the verifier. A later exchange then
    // fails. That event is the only proof this navigation created a recovery
    // session — an existing sign-in must not be allowed to set a password.
    let recoveryEstablished = false;
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") recoveryEstablished = true;
    });

    async function establish() {
      const params = readRecoveryParams(window.location.href);
      try {
        if (params.type === "code") {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error && !recoveryEstablished) throw error;
        } else if (params.type === "otp") {
          const { error } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: params.tokenHash,
          });
          if (error) throw error;
        } else if (params.type === "tokens") {
          const { error } = await supabase.auth.setSession({
            access_token: params.accessToken,
            refresh_token: params.refreshToken,
          });
          if (error) throw error;
        } else {
          if (!cancelled) setInvalid(true);
          return;
        }
        window.history.replaceState({}, "", "/auth/reset");
        if (!cancelled) setReady(true);
      } catch {
        console.error("auth_error");
        if (!cancelled) setInvalid(true);
      }
    }
    void establish();
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    const short = password.length < 6;
    const different = password !== confirm;
    setTooShort(short);
    setMismatch(different);
    if (short || different) return;

    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) {
        setNotice(reportAuthFailure(error));
        return;
      }
      if (!data.user) {
        console.error("auth_error");
        setNotice("generic");
        return;
      }
      await claimGuestViewingData(data.user.id);
      router.push("/");
    } catch {
      console.error("auth_error");
      setNotice("generic");
    } finally {
      setBusy(false);
    }
  }

  const noticeText =
    notice === "rate_limited"
      ? messages.authFlow.rateLimited
      : notice
        ? messages.authFlow.genericError
        : null;

  return (
    <AuthPageShell
      title={messages.authFlow.resetTitle}
      body={invalid ? undefined : messages.authFlow.resetBody}
    >
      <LanguageSwitcher />
      {invalid ? (
        <div className="mt-4">
          <p role="alert" className="text-[13px] leading-[1.5] text-[#991B1B]">
            {messages.authFlow.resetInvalid}
          </p>
          <Link
            href="/auth/forgot"
            className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-black text-[14px] font-bold text-white"
          >
            {messages.authFlow.requestNewLink}
          </Link>
        </div>
      ) : !ready ? (
        <p className="mt-4 text-[13px] text-[#6B7280]">{messages.loginGate.processing}</p>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="mt-4 space-y-3" noValidate>
          <PasswordField
            id="new-password"
            label={messages.authFlow.newPassword}
            value={password}
            autoComplete="new-password"
            showLabel={messages.loginGate.showPassword}
            hideLabel={messages.loginGate.hidePassword}
            invalid={tooShort}
            describedBy={tooShort ? "password-hint" : undefined}
            onChange={setPassword}
          />
          {tooShort ? (
            <p id="password-hint" className="text-[11px] font-medium text-[#991B1B]">
              {messages.loginGate.passwordTooShort}
            </p>
          ) : null}
          <PasswordField
            id="confirm-password"
            label={messages.authFlow.confirmPassword}
            value={confirm}
            autoComplete="new-password"
            showLabel={messages.loginGate.showPassword}
            hideLabel={messages.loginGate.hidePassword}
            invalid={mismatch}
            describedBy={mismatch ? "confirm-hint" : undefined}
            onChange={setConfirm}
          />
          {mismatch ? (
            <p id="confirm-hint" className="text-[11px] font-medium text-[#991B1B]">
              {messages.authFlow.passwordMismatch}
            </p>
          ) : null}
          {noticeText ? (
            <p role="alert" className="text-[12px] leading-[1.4] text-[#991B1B]">
              {noticeText}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="h-12 w-full rounded-full bg-black text-[14px] font-bold text-white disabled:opacity-60"
          >
            {busy ? messages.loginGate.processing : messages.authFlow.resetSubmit}
          </button>
        </form>
      )}
    </AuthPageShell>
  );
}
