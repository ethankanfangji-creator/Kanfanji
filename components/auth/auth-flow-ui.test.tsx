// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { I18nProvider } from "@/components/I18nProvider";
import { AuthNotice } from "./AuthNotice";
import { SignupPendingPanel } from "./SignupPendingPanel";

beforeEach(() => {
  window.localStorage.setItem("kanfangji.locale", "zh-Hant");
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.useRealTimers();
});

function renderWithI18n(node: ReactNode) {
  return render(<I18nProvider>{node}</I18nProvider>);
}

describe("SignupPendingPanel", () => {
  it("shows one neutral message with sign-in, forgot password, and resend", () => {
    renderWithI18n(<SignupPendingPanel email="buyer@example.com" onGoToSignIn={vi.fn()} />);
    expect(screen.getByText(/如果這個 email 還沒註冊/)).toBeVisible();
    expect(screen.getByText(/如果這個 email 還沒註冊/).textContent).toContain("忘記密碼");
    expect(screen.getByRole("button", { name: "前往登入" })).toBeVisible();
    expect(screen.getByRole("link", { name: "忘記密碼" })).toHaveAttribute("href", "/auth/forgot");
    expect(screen.getByRole("button", { name: "沒收到信？重新寄送" })).toBeEnabled();
  });

  it("cools down resend for 60 seconds", async () => {
    vi.useFakeTimers();
    const onResend = vi.fn().mockResolvedValue("ok");
    renderWithI18n(
      <SignupPendingPanel email="buyer@example.com" onGoToSignIn={vi.fn()} onResend={onResend} />,
    );

    await act(async () => {
      screen.getByRole("button", { name: "沒收到信？重新寄送" }).click();
    });
    expect(onResend).toHaveBeenCalledWith("buyer@example.com");
    expect(screen.getByRole("button", { name: /秒後可再寄送/ })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
    });
    expect(screen.getByRole("button", { name: /秒後可再寄送/ })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByRole("button", { name: "沒收到信？重新寄送" })).toBeEnabled();
  });
});

describe("AuthNotice", () => {
  it("offers forgot password for a wrong password", () => {
    renderWithI18n(<AuthNotice kind="invalid_credentials" email="buyer@example.com" />);
    expect(screen.getByRole("alert")).toHaveTextContent("email 或密碼不正確");
    expect(screen.getByRole("link", { name: "忘記密碼" })).toHaveAttribute("href", "/auth/forgot");
  });

  it("offers resend when the email is not confirmed", () => {
    renderWithI18n(<AuthNotice kind="email_not_confirmed" email="buyer@example.com" />);
    expect(screen.getByRole("alert")).toHaveTextContent("請先到信箱點驗證連結");
    expect(screen.getByRole("button", { name: "重新寄送驗證信" })).toBeEnabled();
  });
});
