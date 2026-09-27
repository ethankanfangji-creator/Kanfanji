export type RecoveryParams =
  | { type: "code"; code: string }
  | { type: "otp"; tokenHash: string }
  | { type: "tokens"; accessToken: string; refreshToken: string }
  | { type: "missing" };

/** Read the recovery credentials Supabase appends to /auth/reset. */
export function readRecoveryParams(href: string): RecoveryParams {
  const url = new URL(href);
  if (url.searchParams.get("error") || url.searchParams.get("error_code")) {
    return { type: "missing" };
  }

  const code = url.searchParams.get("code");
  if (code) return { type: "code", code };

  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");
  if (tokenHash && otpType === "recovery") {
    return { type: "otp", tokenHash };
  }

  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const hashType = hash.get("type");
  if (accessToken && refreshToken && (hashType == null || hashType === "recovery")) {
    return { type: "tokens", accessToken, refreshToken };
  }

  return { type: "missing" };
}
