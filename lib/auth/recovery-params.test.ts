import { describe, expect, it } from "vitest";
import { readRecoveryParams } from "./recovery-params";

describe("readRecoveryParams", () => {
  it("reads a PKCE code", () => {
    expect(readRecoveryParams("https://kanfanji.vercel.app/auth/reset?code=abc")).toEqual({
      type: "code",
      code: "abc",
    });
  });

  it("reads a recovery token hash", () => {
    expect(
      readRecoveryParams("https://kanfanji.vercel.app/auth/reset?token_hash=hash&type=recovery"),
    ).toEqual({ type: "otp", tokenHash: "hash" });
  });

  it("reads implicit recovery tokens", () => {
    expect(
      readRecoveryParams(
        "https://kanfanji.vercel.app/auth/reset#access_token=a&refresh_token=r&type=recovery",
      ),
    ).toEqual({ type: "tokens", accessToken: "a", refreshToken: "r" });
  });

  it("treats provider errors as a missing session", () => {
    expect(
      readRecoveryParams(
        "https://kanfanji.vercel.app/auth/reset?error=access_denied&error_code=otp_expired",
      ),
    ).toEqual({ type: "missing" });
  });
});
