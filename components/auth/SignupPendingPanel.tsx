"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/components/I18nProvider";
import type { ResendSignupResult } from "@/lib/auth/auth-flow";
import { ResendVerificationButton } from "./ResendVerificationButton";

/** Neutral post-signup screen. Same copy for new and repeated signups. */
export function SignupPendingPanel({
  email,
  onGoToSignIn,
  onResend,
}: {
  email: string;
  onGoToSignIn?: () => void;
  onResend?: (email: string) => Promise<ResendSignupResult>;
}) {
  const { messages } = useI18n();

  return (
    <div>
      <LanguageSwitcher />
      <p role="status" className="mt-4 text-[13px] leading-[1.5] text-[#1A1A1A]">
        {messages.authFlow.signupNeutral}
      </p>
      <div className="mt-4 space-y-3">
        {onGoToSignIn ? (
          <button
            type="button"
            onClick={onGoToSignIn}
            className="h-12 w-full rounded-full bg-black text-[14px] font-bold text-white"
          >
            {messages.authFlow.goToSignIn}
          </button>
        ) : (
          <Link
            href="/login"
            className="flex h-12 w-full items-center justify-center rounded-full bg-black text-[14px] font-bold text-white"
          >
            {messages.authFlow.goToSignIn}
          </Link>
        )}
        <Link
          href="/auth/forgot"
          className="flex h-12 w-full items-center justify-center rounded-full border border-black/10 text-[14px] font-bold"
        >
          {messages.authFlow.forgotPassword}
        </Link>
      </div>
      <ResendVerificationButton
        email={email}
        label="signup"
        className="mt-3"
        onResend={onResend}
      />
    </div>
  );
}
