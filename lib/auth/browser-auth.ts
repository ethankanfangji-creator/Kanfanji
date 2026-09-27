import { createClient } from "@/utils/supabase/client";
import {
  passwordResetRequestResult,
  resendSignupResult,
  type PasswordResetRequestResult,
  type ResendSignupResult,
} from "@/lib/auth/auth-flow";

function logMaskedAuthFailure() {
  // The screen stays neutral on purpose. Do not print the code: a code such
  // as user_not_found would show whether the email is registered.
  console.error("auth_error");
}

export async function resendSignupEmail(email: string): Promise<ResendSignupResult> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    const result = resendSignupResult(error);
    if (error && result === "ok") logMaskedAuthFailure();
    return result;
  } catch {
    console.error("auth_error");
    return "failed";
  }
}

export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    const result = passwordResetRequestResult(error);
    if (error && result === "ok") logMaskedAuthFailure();
    return result;
  } catch {
    console.error("auth_error");
    return "failed";
  }
}
