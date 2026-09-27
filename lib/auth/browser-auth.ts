import { createClient } from "@/utils/supabase/client";
import { authRedirectUrl } from "@/lib/auth/auth-urls";
import {
  passwordResetRequestResult,
  readAuthErrorCode,
  readAuthErrorStatus,
  resendSignupResult,
  type PasswordResetRequestResult,
  type ResendSignupResult,
} from "@/lib/auth/auth-flow";

/** Debug codes outside production. Never print the email, password, or message. */
export function logSuppressedAuthError(error: unknown) {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === "production") {
    console.error("auth_error");
    return;
  }
  const code = readAuthErrorCode(error) ?? "auth_error";
  const status = readAuthErrorStatus(error);
  console.warn(status == null ? code : `${code} ${status}`);
}

export async function resendSignupEmail(email: string): Promise<ResendSignupResult> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: authRedirectUrl("/auth/callback"),
      },
    });
    if (error) logSuppressedAuthError(error);
    return resendSignupResult(error);
  } catch {
    console.error("auth_error");
    return "failed";
  }
}

export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectUrl("/auth/reset"),
    });
    if (error) logSuppressedAuthError(error);
    return passwordResetRequestResult(error);
  } catch {
    console.error("auth_error");
    return "failed";
  }
}
