"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthNotice } from "@/components/auth/AuthNotice";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { SignupPendingPanel } from "@/components/auth/SignupPendingPanel";
import {
  LoginAuthFields,
  type LoginGateCopy,
} from "@/components/auth/LoginGateDialog";
import { useI18n } from "@/components/I18nProvider";
import { claimGuestViewingData } from "@/lib/auth/claim-guest-data";
import { reportAuthFailure, signupUiOutcome, type AuthFailureKind } from "@/lib/auth/auth-flow";
import { safeInternalNextPath } from "@/lib/http/safe-next";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const { messages } = useI18n();
  const searchParams = useSearchParams();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const next = searchParams.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">(
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );
  useEffect(() => {
    if (searchParams.get("mode") === "signup") setMode("signup");
  }, [searchParams]);
  const [notice, setNotice] = useState<AuthFailureKind | null>(null);
  const [signupPending, setSignupPending] = useState(false);
  const [loading, setLoading] = useState(false);

  const copy: LoginGateCopy = {
    title: mode === "signin" ? messages.loginPage.signInTitle : messages.loginPage.signUpTitle,
    email: messages.loginGate.email,
    password: messages.loginGate.password,
    processing: messages.loginGate.processing,
    submitSignIn: messages.loginPage.submitSignIn,
    submitSignUp: messages.loginPage.submitSignUp,
    switchToSignUp: messages.loginPage.switchToSignUp,
    switchToSignIn: messages.loginPage.switchToSignIn,
    close: messages.card.close,
    showPassword: messages.loginGate.showPassword,
    hidePassword: messages.loginGate.hidePassword,
    emailInvalid: messages.loginGate.emailInvalid,
    passwordTooShort: messages.loginGate.passwordTooShort,
    forgotPassword: messages.authFlow.forgotPassword,
  };

  function goToSignIn() {
    setSignupPending(false);
    setMode("signin");
    setNotice(null);
    setPassword("");
  }

  async function finishSignIn() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error("auth_error");
      setNotice("generic");
      return;
    }
    await claimGuestViewingData(user.id);
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = safeInternalNextPath(next);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    const supabase = createClient();
    const trimmedEmail = email.trim();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeInternalNextPath(next))}`,
          },
        });
        const outcome = signupUiOutcome(error, Boolean(data?.session));
        if (outcome === "signed_in") {
          await finishSignIn();
          return;
        }
        if (outcome === "pending") {
          setSignupPending(true);
          return;
        }
        if (error) reportAuthFailure(error);
        setNotice(outcome);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) {
        setNotice(reportAuthFailure(error));
        return;
      }
      await finishSignIn();
    } catch {
      console.error("auth_error");
      setNotice("generic");
    } finally {
      setLoading(false);
    }
  }

  const title = signupPending
    ? messages.loginPage.signUpTitle
    : mode === "signin"
      ? messages.loginPage.signInTitle
      : messages.loginPage.signUpTitle;

  return (
    <AuthPageShell title={title}>
      {signupPending ? (
        <SignupPendingPanel email={email} onGoToSignIn={goToSignIn} />
      ) : (
        <LoginAuthFields
          copy={copy}
          email={email}
          password={password}
          mode={mode}
          error={notice ? <AuthNotice kind={notice} email={email} /> : null}
          busy={loading}
          emailInputRef={emailInputRef}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onModeChange={(next) => {
            setMode(next);
            setNotice(null);
          }}
          onSubmit={(event) => void onSubmit(event)}
        />
      )}
    </AuthPageShell>
  );
}
