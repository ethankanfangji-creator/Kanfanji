"use client";

import type { AuthFailureKind } from "@/lib/auth/auth-flow";
import { useI18n } from "@/components/I18nProvider";
import { resendSignupEmail } from "@/lib/auth/browser-auth";
import { ResendVerificationButton } from "./ResendVerificationButton";

export function AuthNotice({
  kind,
  email,
}: {
  kind: AuthFailureKind;
  email: string;
}) {
  const { messages } = useI18n();
  const text =
    kind === "invalid_credentials"
      ? messages.authFlow.invalidCredentials
      : kind === "email_not_confirmed"
        ? messages.authFlow.emailNotConfirmed
        : kind === "rate_limited"
          ? messages.authFlow.signInRateLimited
          : messages.authFlow.genericError;

  return (
    <div role="alert" className="mt-3 text-[12px] leading-[1.4] text-[#991B1B]">
      <p>{text}</p>
      {kind === "email_not_confirmed" ? (
        <ResendVerificationButton
          email={email}
          label="confirm"
          purpose="signup"
          className="mt-1"
          onResend={resendSignupEmail}
        />
      ) : null}
    </div>
  );
}
