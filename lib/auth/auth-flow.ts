/** Auth UI decisions that must not reveal whether an email is registered. */

export type AuthFailureKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "generic";

export type SignupUiOutcome = "signed_in" | "pending" | AuthFailureKind;

const RATE_LIMIT_CODES = new Set([
  "over_request_rate_limit",
  "over_email_send_rate_limit",
]);

/** Errors that mean "this email already has an account". Shown as the neutral signup screen. */
const SIGNUP_EXISTS_CODES = new Set([
  "email_exists",
  "user_already_exists",
  "user_already_registered",
  "identity_already_exists",
]);

export function readAuthErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.length > 0 ? code : undefined;
}

function readAuthErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

export function classifyAuthError(error: unknown): {
  kind: AuthFailureKind;
  code?: string;
} {
  const code = readAuthErrorCode(error);
  const status = readAuthErrorStatus(error);
  if (status === 429 || (code != null && RATE_LIMIT_CODES.has(code))) {
    return { kind: "rate_limited", code };
  }
  if (code === "invalid_credentials") return { kind: "invalid_credentials", code };
  if (code === "email_not_confirmed") return { kind: "email_not_confirmed", code };
  return { kind: "generic", code };
}

/**
 * Log only the stable error code. Never the email, password, or error message.
 */
export function reportAuthFailure(error: unknown): AuthFailureKind {
  const failure = classifyAuthError(error);
  if (failure.kind === "generic") {
    console.error(failure.code ?? "auth_error");
  }
  return failure.kind;
}

function masksSignupExistence(error: unknown): boolean {
  const code = readAuthErrorCode(error);
  return code != null && SIGNUP_EXISTS_CODES.has(code);
}

/**
 * Choose the signup screen.
 * Do not branch on `user.identities` — an empty array is how Supabase hides
 * repeated signups, and a different message would confirm the email exists.
 */
export function signupUiOutcome(error: unknown, hasSession: boolean): SignupUiOutcome {
  if (!error && hasSession) return "signed_in";
  if (!error || masksSignupExistence(error)) return "pending";
  const failure = classifyAuthError(error);
  if (failure.kind === "rate_limited") return "rate_limited";
  return "generic";
}

export type PasswordResetRequestResult = "ok" | "rate_limited" | "failed";

/** Same visible result unless the request was rate-limited or never left the browser. */
export function passwordResetRequestResult(error: unknown): PasswordResetRequestResult {
  if (!error) return "ok";
  const failure = classifyAuthError(error);
  if (failure.kind === "rate_limited") return "rate_limited";
  return "ok";
}

export type ResendSignupResult = "ok" | "rate_limited" | "failed";

export function resendSignupResult(error: unknown): ResendSignupResult {
  if (!error) return "ok";
  const failure = classifyAuthError(error);
  if (failure.kind === "rate_limited") return "rate_limited";
  return "ok";
}
