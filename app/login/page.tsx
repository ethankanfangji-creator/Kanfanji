"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/components/I18nProvider";
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
        window.location.href = "/";
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-[700] tracking-[0.18em] opacity-60">KANFANGJI</p>
            <h1 className="text-[24px] font-[800] mt-2 tracking-tight">
              {mode === "signin"
                ? messages.loginPage.signInTitle
                : messages.loginPage.signUpTitle}
            </h1>
          </div>
          <LanguageSwitcher />
        </div>
        <p className="text-[13px] text-[#8A8A8A] mt-2 leading-[1.5]">{messages.loginPage.body}</p>

        <form
          onSubmit={(event) => void onSubmit(event)}
          className="mt-6 bg-white rounded-[22px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-5 space-y-3"
        >
          <label className="block">
            <span className="text-[12px] font-bold tracking-widest">EMAIL</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full h-[44px] px-4 rounded-full bg-[#F8F4EF] border border-black/5 text-[14px] outline-none focus:ring-2 focus:ring-black/10"
              placeholder="you@email.com"
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-bold tracking-widest">PASSWORD</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full h-[44px] px-4 rounded-full bg-[#F8F4EF] border border-black/5 text-[14px] outline-none focus:ring-2 focus:ring-black/10"
              placeholder={messages.loginGate.password}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-[46px] rounded-full bg-black text-white text-[14px] font-bold disabled:opacity-60"
          >
            {loading
              ? messages.loginGate.processing
              : mode === "signin"
                ? messages.loginPage.submitSignIn
                : messages.loginPage.submitSignUp}
          </button>

          {message && <p className="text-[12px] text-[#6B7280] leading-[1.4]">{message}</p>}
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((current) => (current === "signin" ? "signup" : "signin"));
            setMessage("");
          }}
          className="mt-4 text-[13px] font-medium text-[#6B7280]"
        >
          {mode === "signin"
            ? messages.loginPage.switchToSignUp
            : messages.loginPage.switchToSignIn}
        </button>

        <div className="mt-8">
          <Link href="/" className="text-[12px] text-[#9CA3AF]">
            {messages.loginPage.backHome}
          </Link>
        </div>
      </div>
    </div>
  );
}
