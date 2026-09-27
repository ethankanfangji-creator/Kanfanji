"use client";

import Link from "next/link";
import type { AuthFailureKind } from "@/lib/auth/auth-flow";
import { useI18n } from "@/components/I18nProvider";
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
          ? messages.authFlow.rateLimited
          : messages.authFlow.genericError;

  return (
    <div role="alert" className="mt-3 text-[12px] leading-[1.4] text-[#991B1B]">
      <p>{text}</p>
      {kind === "invalid_credentials" ? (
        <Link
          href="/auth/forgot"
          className="mt-1 inline-flex min-h-11 items-center font-bold underline-offset-2 hover:underline"
        >
          {messages.authFlow.forgotPassword}
        </Link>
      ) : null}
      {kind === "email_not_confirmed" ? (
        <ResendVerificationButton email={email} label="confirm" className="mt-1" />
      ) : null}
    </div>
  );
}
