"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/components/I18nProvider";
import { Button, Card, Field, PageHeader } from "@/components/ui/primitives";
import { claimGuestViewingData } from "@/lib/auth/claim-guest-data";
import { safeInternalNextPath } from "@/lib/http/safe-next";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const { messages } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen w-full flex justify-center bg-[#FDF6F0] text-[#1A1A1A]">
      <div className="w-full max-w-[420px] px-4 pt-10 pb-28">
        <PageHeader
          eyebrow="KANFANGJI"
          title={
            mode === "signin"
              ? messages.loginPage.signInTitle
              : messages.loginPage.signUpTitle
          }
          description={messages.loginPage.body}
          actions={<LanguageSwitcher />}
        />

        <Card className="mt-6">
          <form onSubmit={(event) => void onSubmit(event)} className="space-y-3">
            <Field
              label="EMAIL"
              type="email"
              required
              maxLength={320}
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
            />
            <Field
              label="PASSWORD"
              type="password"
              required
              minLength={6}
              maxLength={128}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={messages.loginGate.password}
            />

            <Button type="submit" disabled={loading} className="w-full">
              {loading
                ? messages.loginGate.processing
                : mode === "signin"
                  ? messages.loginPage.submitSignIn
                  : messages.loginPage.submitSignUp}
            </Button>

            {message ? (
              <p role="status" aria-live="polite" className="text-xs leading-5 text-[#6B7280]">
                {message}
              </p>
            ) : null}
          </form>
        </Card>

        <Button
          type="button"
          tone="secondary"
          onClick={() => {
            setMode((current) => (current === "signin" ? "signup" : "signin"));
            setMessage("");
          }}
          className="mt-4"
        >
          {mode === "signin"
            ? messages.loginPage.switchToSignUp
            : messages.loginPage.switchToSignIn}
        </Button>

        <div className="mt-8">
          <Link href="/" className="text-[12px] text-[#9CA3AF]">
            {messages.loginPage.backHome}
          </Link>
        </div>
      </div>
    </div>
  );
}
