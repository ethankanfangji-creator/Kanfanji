import { describe, expect, it, vi } from "vitest";
import en from "@/lib/i18n/messages/en";
import zhHant from "@/lib/i18n/messages/zh-Hant";
import {
  classifyAuthError,
  passwordResetRequestResult,
  reportAuthFailure,
  resendSignupResult,
  signupUiOutcome,
} from "./auth-flow";

describe("classifyAuthError", () => {
  it("maps invalid credentials, unconfirmed email, and rate limits", () => {
    expect(classifyAuthError({ code: "invalid_credentials", status: 400 }).kind).toBe(
      "invalid_credentials",
    );
    expect(classifyAuthError({ code: "email_not_confirmed" }).kind).toBe("email_not_confirmed");
    expect(classifyAuthError({ code: "over_request_rate_limit", status: 429 }).kind).toBe(
      "rate_limited",
    );
    expect(classifyAuthError({ code: "over_email_send_rate_limit" }).kind).toBe("rate_limited");
    expect(classifyAuthError({ status: 429 }).kind).toBe("rate_limited");
  });

  it("treats unknown failures as generic and logs only the code", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      reportAuthFailure({
        code: "unexpected_failure",
        message: "user@example.com secret-password",
        status: 500,
      }),
    ).toBe("generic");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]).toEqual(["unexpected_failure"]);
    expect(String(errorSpy.mock.calls)).not.toContain("user@example.com");
    expect(String(errorSpy.mock.calls)).not.toContain("secret-password");
    errorSpy.mockRestore();
  });
});

describe("signupUiOutcome", () => {
  it("shows the same pending screen for a new signup and a repeated signup", () => {
    expect(signupUiOutcome(null, false)).toBe("pending");
    expect(signupUiOutcome({ code: "email_exists", status: 422 }, false)).toBe("pending");
    expect(signupUiOutcome({ code: "user_already_exists" }, false)).toBe("pending");
  });

  it("continues only when Supabase returned a real session", () => {
    expect(signupUiOutcome(null, true)).toBe("signed_in");
  });

  it("does not treat rate limits as a successful signup", () => {
    expect(signupUiOutcome({ code: "over_email_send_rate_limit", status: 429 }, false)).toBe(
      "rate_limited",
    );
  });
});

describe("neutral email actions", () => {
  it("uses one result for password reset and resend except rate limits", () => {
    expect(passwordResetRequestResult(null)).toBe("ok");
    expect(passwordResetRequestResult({ code: "user_not_found" })).toBe("ok");
    expect(passwordResetRequestResult({ status: 429 })).toBe("rate_limited");
    expect(resendSignupResult({ code: "user_not_found" })).toBe("ok");
    expect(resendSignupResult({ code: "over_email_send_rate_limit" })).toBe("rate_limited");
  });
});

describe("authFlow copy", () => {
  it("has distinct Traditional Chinese and English strings", () => {
    expect(zhHant.authFlow.signupNeutral).toContain("如果這個 email 還沒註冊");
    expect(en.authFlow.signupNeutral).toContain("If this email is not registered yet");
    expect(zhHant.authFlow.invalidCredentials).toBe("email 或密碼不正確");
    expect(en.authFlow.invalidCredentials).toBe("Incorrect email or password");
    expect(zhHant.authFlow.forgotOk).toBe("如果這個 email 有帳號，重設連結已寄出");
    expect(en.authFlow.forgotOk).toContain("If an account exists for this email");
    expect(zhHant.authFlow.emailNotConfirmed).toBe("請先到信箱點驗證連結");
    expect(en.authFlow.rateLimited).toContain("Too many attempts");
  });
});
