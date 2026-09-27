import { describe, expect, it, vi } from "vitest";
import en from "@/lib/i18n/messages/en";
import th from "@/lib/i18n/messages/th";
import zhHans from "@/lib/i18n/messages/zh-Hans";
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

  it("hides an email-send limit and shows a sign-in limit", () => {
    expect(signupUiOutcome({ code: "over_email_send_rate_limit", status: 429 }, false)).toBe(
      "pending",
    );
    expect(signupUiOutcome({ code: "over_request_rate_limit", status: 429 }, false)).toBe(
      "rate_limited",
    );
    expect(signupUiOutcome({ status: 429 }, false)).toBe("rate_limited");
  });
});

describe("neutral email actions", () => {
  it("treats every password-reset response as the same confirmation", () => {
    expect(passwordResetRequestResult(null)).toBe("ok");
    expect(passwordResetRequestResult({ status: 429, code: "over_email_send_rate_limit" })).toBe(
      "ok",
    );
    expect(passwordResetRequestResult({ status: 400, code: "validation_failed" })).toBe("ok");
    expect(resendSignupResult({ code: "user_not_found" })).toBe("ok");
    expect(resendSignupResult({ code: "over_email_send_rate_limit", status: 429 })).toBe(
      "rate_limited",
    );
  });
});

describe("authFlow copy", () => {
  it("does not hint whether an email is registered", () => {
    const banned = [
      "如果這個 " + "email",
      "如果这个 " + "email",
      "If this " + "email",
      "ถ้าอีเมลนี้ยัง" + "ไม่ได้สมัคร",
    ];
    for (const catalog of [zhHant, zhHans, en, th]) {
      for (const phrase of banned) {
        expect(catalog.authFlow.signupNeutral).not.toContain(phrase);
      }
    }
    expect(zhHant.authFlow.signupNeutral.startsWith("請到信箱查看驗證信")).toBe(true);
    expect(zhHant.authFlow.resendSignupStatus).toBe("已重新寄出，請到信箱查看（含垃圾郵件）。");
    expect(en.authFlow.resendSignupStatus).toBe("Sent again. Check your inbox (and spam folder).");
    expect(zhHant.authFlow.invalidCredentials).toBe("email 或密碼不正確");
    expect(en.authFlow.forgotOk).toBe("Reset link sent. Check your inbox (and spam folder).");
    expect(zhHant.authFlow.signInRateLimited).toBe("登入太頻繁，請等幾分鐘再試");
  });
});
