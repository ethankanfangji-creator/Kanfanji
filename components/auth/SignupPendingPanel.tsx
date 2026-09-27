"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { resendSignupEmail } from "@/lib/auth/browser-auth";
import type { ResendSignupResult } from "@/lib/auth/auth-flow";
import { authPrimaryButton, authSecondaryButton } from "./auth-styles";
import { ResendVerificationButton } from "./ResendVerificationButton";

/** Neutral post-signup screen. Same copy for every email. */
export function SignupPendingPanel({
  email,
  onGoToSignIn,
  onResend = resendSignupEmail,
}: {
  email: string;
  onGoToSignIn?: () => void;
  onResend?: (email: string) => Promise<ResendSignupResult>;
}) {
  const { messages } = useI18n();

  return (
    <div>
      <p role="status" className="text-[13px] leading-[1.5] text-[#1A1A1A]">
        {messages.authFlow.signupNeutral}
      </p>
      <div className="mt-4 space-y-3">
        {onGoToSignIn ? (
          <button type="button" onClick={onGoToSignIn} className={authPrimaryButton}>
            {messages.authFlow.goToSignIn}
          </button>
        ) : (
          <Link href="/login" className={authPrimaryButton}>
            {messages.authFlow.goToSignIn}
          </Link>
        )}
        <Link href="/auth/forgot" className={authSecondaryButton}>
          {messages.authFlow.forgotPassword}
        </Link>
      </div>
      <ResendVerificationButton
        email={email}
        label="signup"
        purpose="signup"
        className="mt-3"
        onResend={onResend}
      />
    </div>
  );
}
