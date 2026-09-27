// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { I18nProvider } from "@/components/I18nProvider";
import LoginPage from "@/app/login/page";
import ForgotPasswordPage from "@/app/auth/forgot/page";
import ResetPasswordPage from "@/app/auth/reset/page";
import { LoginGateDialog, type LoginGateCopy } from "./LoginGateDialog";

const { resetPasswordForEmail, verifyOtp, onAuthStateChange } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  verifyOtp: vi.fn(),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail,
      verifyOtp,
      onAuthStateChange,
      exchangeCodeForSession: vi.fn(),
      setSession: vi.fn(),
      updateUser: vi.fn(),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      getUser: vi.fn(),
    },
  }),
}));

const gateCopy: LoginGateCopy = {
  title: "登入後才能分享",
  body: "先登入。",
  email: "Email",
  password: "密碼",
  processing: "處理中...",
  submitSignIn: "登入並繼續",
  submitSignUp: "註冊並繼續",
  switchToSignUp: "還沒有帳號？註冊",
  switchToSignIn: "已有帳號？登入",
  close: "關閉",
  showPassword: "顯示密碼",
  hidePassword: "隱藏密碼",
  emailInvalid: "請輸入有效的 Email",
  passwordTooShort: "密碼至少 6 碼",
  forgotPassword: "忘記密碼",
};

function setLanguage(language: string) {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: language,
  });
}

beforeEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetPasswordForEmail.mockReset();
  verifyOtp.mockReset();
  onAuthStateChange.mockClear();
  setLanguage("zh-TW");
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("auth pages follow the saved locale and hide the switcher", () => {
  it("uses the stored locale, then the browser language", async () => {
    window.localStorage.setItem("kanfangji.locale", "en");
    const { unmount } = render(
      <I18nProvider>
        <LoginPage />
      </I18nProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(screen.queryByRole("combobox")).toBeNull();
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    unmount();

    window.localStorage.clear();
    setLanguage("en-US");
    const second = render(
      <I18nProvider>
        <ForgotPasswordPage />
      </I18nProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Reset password" })).toBeVisible();
    expect(screen.queryByRole("combobox")).toBeNull();
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    second.unmount();

    setLanguage("zh-TW");
    render(
      <I18nProvider>
        <ResetPasswordPage />
      </I18nProvider>,
    );
    expect(await screen.findByText(/這個重設連結無效或已過期/)).toBeVisible();
    expect(screen.queryByRole("combobox")).toBeNull();
    await waitFor(() => expect(document.documentElement.lang).toBe("zh-Hant"));
  });

  it("does not show a language switcher in the sign-in dialog", () => {
    window.localStorage.setItem("kanfangji.locale", "zh-Hant");
    render(
      <I18nProvider>
        <LoginGateDialog
          open
          copy={gateCopy}
          email=""
          password=""
          mode="signin"
          error=""
          busy={false}
          onEmailChange={vi.fn()}
          onPasswordChange={vi.fn()}
          onModeChange={vi.fn()}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("link", { name: "忘記密碼" })).toBeVisible();
  });
});

describe("forgot password confirmation", () => {
  async function submit(email = "buyer@example.com") {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <ForgotPasswordPage />
      </I18nProvider>,
    );
    await user.type(screen.getByLabelText("Email"), email);
    await user.click(screen.getByRole("button", { name: "寄出重設連結" }));
  }

  async function expectConfirmation(email: string) {
    expect(await screen.findByRole("status")).toHaveTextContent(
      "重設連結已寄出，請查看信箱（含垃圾郵件）。",
    );
    expect(document.body.textContent).not.toContain(email);
    expect(await screen.findByRole("button", { name: /秒後可再寄送/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.queryByText("嘗試次數太多，請稍後再試")).toBeNull();
  }

  it("shows the same screen for success, a send limit, and any other API error", async () => {
    const cases = [
      { error: null },
      { error: { status: 429, code: "over_email_send_rate_limit" } },
      { error: { status: 400, code: "validation_failed" } },
    ];
    let confirmed = "";
    for (const response of cases) {
      cleanup();
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith("kanfangji.authCooldown.")) window.localStorage.removeItem(key);
      }
      resetPasswordForEmail.mockResolvedValue(response);
      await submit();
      await expectConfirmation("buyer@example.com");
      const visible = (document.body.textContent ?? "").replace(/\d+(?= 秒)/, "N");
      if (!confirmed) confirmed = visible;
      else expect(visible).toBe(confirmed);
      expect(resetPasswordForEmail).toHaveBeenCalledWith("buyer@example.com", {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
    }
  });

  it("shows a generic error when the request never leaves the browser", async () => {
    resetPasswordForEmail.mockRejectedValue(new Error("offline buyer@example.com"));
    await submit();
    expect(screen.getByRole("alert")).toHaveTextContent("暫時無法完成，請稍後再試");
    expect(screen.queryByText(/重設連結已寄出/)).toBeNull();
  });
});

describe("password reset link", () => {
  it("verifies a recovery token hash and then shows the new-password form", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    window.history.replaceState({}, "", "/auth/reset?token_hash=x&type=recovery");
    render(
      <I18nProvider>
        <ResetPasswordPage />
      </I18nProvider>,
    );
    expect(await screen.findByLabelText("新密碼")).toBeVisible();
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "x" });
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
