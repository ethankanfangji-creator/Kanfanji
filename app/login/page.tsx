"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  LoginAuthFields,
  type LoginGateCopy,
} from "@/components/auth/LoginGateDialog";
import { claimGuestViewingData } from "@/lib/auth/claim-guest-data";
import { safeInternalNextPath } from "@/lib/http/safe-next";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const { messages } = useI18n();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const copy: LoginGateCopy = {
    title:
      mode === "signin"
        ? messages.loginPage.signInTitle
        : messages.loginPage.signUpTitle,
    body: messages.loginPage.body,
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
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setMessage(messages.loginPage.signupOk);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error(messages.loginPage.submitSignIn);
        await claimGuestViewingData(user.id);
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href = safeInternalNextPath(next);
        return;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : messages.loginPage.submitSignIn);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full justify-center bg-[#FAF6F1] text-[#1A1A1A]">
      <div className="relative my-auto w-full max-w-[420px] px-4 py-10">
        <p className="text-[11px] font-bold tracking-wide text-[#9CA3AF]">KANFANGJI</p>
        <h1 className="mt-2 text-[22px] font-bold leading-snug">{copy.title}</h1>
        <p className="mt-2 text-[13px] leading-[1.5] text-[#6B7280]">{copy.body}</p>

        <div className="relative mt-6 rounded-[20px] border border-black/8 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
          <LoginAuthFields
            copy={copy}
            email={email}
            password={password}
            mode={mode}
            error={message}
            busy={loading}
            emailInputRef={emailInputRef}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onModeChange={(next) => {
              setMode(next);
              setMessage("");
            }}
            onSubmit={(event) => void onSubmit(event)}
          />
        </div>

        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-[12px] font-medium text-[#6B7280] underline-offset-2 hover:underline"
          >
            {messages.loginPage.backHome}
          </Link>
          <Link
            href="/privacy"
            className="ml-4 inline-flex min-h-11 items-center text-[12px] font-medium text-[#6B7280] underline-offset-2 hover:underline"
          >
            {messages.nav.privacy}
          </Link>
        </div>
      </div>
    </div>
  );
}
