"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { authPrimaryButton } from "@/components/auth/auth-styles";
import { useI18n } from "@/components/I18nProvider";
import { claimGuestViewingData } from "@/lib/auth/claim-guest-data";
import { reportAuthFailure, type AuthFailureKind } from "@/lib/auth/auth-flow";
import { readRecoveryParams } from "@/lib/auth/recovery-params";
import { createClient } from "@/utils/supabase/client";

const RESET_RECOVERY_KEY = "kanfangji.resetRecovery";
const RESET_MOUNT_KEY = "kanfangji.resetMount";

function resetRecoveryMark(): "ready" | "left" | null {
  try {
    const value = window.sessionStorage.getItem(RESET_RECOVERY_KEY);
    return value === "ready" || value === "left" ? value : null;
  } catch {
    return null;
  }
}

function setResetRecoveryMark(value: "ready" | "left") {
  try {
    window.sessionStorage.setItem(RESET_RECOVERY_KEY, value);
  } catch {
    // Private mode can reject storage; the in-page event still gates this visit.
  }
}

/** Code from the document load, after initialize() has removed it from the address bar. */
function codeFromInitialNavigation(): string | null {
  const href = performance.getEntriesByType("navigation")[0]?.name;
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.pathname !== "/auth/reset") return null;
    const params = readRecoveryParams(href);
    return params.type === "code" ? params.code : null;
  } catch {
    return null;
  }
}

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
    // createBrowserClient exchanges a same-browser PKCE code during initialize
    // and emits PASSWORD_RECOVERY on a later turn, after the verifier is gone.
    // A follow-up exchange then fails. That event, or a session saved only
    // once this code has left the URL, proves this navigation created a
    // recovery session. An existing sign-in must not set a password.
    let recoveryEstablished = false;
    const supabase = createClient();
    const mountId = `${Date.now()}-${Math.random()}`;
    try {
      window.sessionStorage.setItem(RESET_MOUNT_KEY, mountId);
    } catch {
      // Same as setResetRecoveryMark: this visit can still use PASSWORD_RECOVERY.
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") recoveryEstablished = true;
    });

    async function consumedRecoverySession(code: string) {
      if (!recoveryEstablished) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (recoveryEstablished) return true;
      if (new URL(window.location.href).searchParams.get("code") === code) return false;
      const { data } = await supabase.auth.getSession();
      return data.session != null;
    }

    async function establish() {
      const params = readRecoveryParams(window.location.href);
      try {
        if (params.type === "code") {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error && !(await consumedRecoverySession(params.code))) throw error;
          setResetRecoveryMark("ready");
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
        } else if (resetRecoveryMark() === "ready") {
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            if (!cancelled) setInvalid(true);
            return;
          }
        } else if (
          resetRecoveryMark() !== "left" &&
          window.location.pathname === "/auth/reset"
        ) {
          const initialCode = codeFromInitialNavigation();
          if (!initialCode || !(await consumedRecoverySession(initialCode))) {
            if (!cancelled) setInvalid(true);
            return;
          }
          setResetRecoveryMark("ready");
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
      setTimeout(() => {
        try {
          if (window.sessionStorage.getItem(RESET_MOUNT_KEY) !== mountId) return;
        } catch {
          return;
        }
        if (window.location.pathname !== "/auth/reset") setResetRecoveryMark("left");
      }, 0);
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
        const kind = reportAuthFailure(error);
        setNotice(kind === "rate_limited" ? "generic" : kind);
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

  const noticeText = notice ? messages.authFlow.genericError : null;

  return (
    <AuthPageShell
      title={messages.authFlow.resetTitle}
      body={invalid ? undefined : messages.authFlow.resetBody}
    >
      {invalid ? (
        <div className="mt-4">
          <p role="alert" className="text-[13px] leading-[1.5] text-[#991B1B]">
            {messages.authFlow.resetInvalid}
          </p>
          <Link href="/auth/forgot" className={`mt-4 ${authPrimaryButton}`}>
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
          <button type="submit" disabled={busy} className={authPrimaryButton}>
            {busy ? messages.loginGate.processing : messages.authFlow.resetSubmit}
          </button>
        </form>
      )}
    </AuthPageShell>
  );
}
