// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { I18nProvider } from "@/components/I18nProvider";
import { AuthNotice } from "./AuthNotice";
import { SignupPendingPanel } from "./SignupPendingPanel";
import { ResendVerificationButton } from "./ResendVerificationButton";
import { authTextLink } from "./auth-styles";
import { LoginAuthFields, type LoginGateCopy } from "./LoginGateDialog";
import { useState } from "react";

function clearCooldownKeys() {
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("kanfangji.authCooldown.")) window.localStorage.removeItem(key);
  }
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("kanfangji.locale", "zh-Hant");
  clearCooldownKeys();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.useRealTimers();
});

async function flushCooldown() {
  for (let step = 0; step < 8; step += 1) {
    await act(async () => {
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
      else await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function renderWithI18n(node: ReactNode) {
  return render(<I18nProvider>{node}</I18nProvider>);
}

const copy: LoginGateCopy = {
  title: "登入",
  email: "Email",
  password: "密碼",
  processing: "處理中...",
  submitSignIn: "登入",
  submitSignUp: "註冊",
  switchToSignUp: "還沒有帳號？註冊",
  switchToSignIn: "已有帳號？登入",
  close: "關閉",
  showPassword: "顯示密碼",
  hidePassword: "隱藏密碼",
  emailInvalid: "請輸入有效的 Email",
  passwordTooShort: "密碼至少 6 碼",
  forgotPassword: "忘記密碼",
};

function Fields({
  mode = "signin",
  error = null,
}: {
  mode?: "signin" | "signup";
  error?: ReactNode;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [current, setCurrent] = useState(mode);
  return (
    <LoginAuthFields
      copy={copy}
      email={email}
      password={password}
      mode={current}
      error={error}
      busy={false}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onModeChange={setCurrent}
      onSubmit={(event) => event.preventDefault()}
    />
  );
}

describe("SignupPendingPanel", () => {
  it("shows one neutral message and no language switcher", () => {
    renderWithI18n(<SignupPendingPanel email="buyer@example.com" onGoToSignIn={vi.fn()} />);
    expect(screen.getByText(/請到信箱查看驗證信/)).toBeVisible();
    expect(screen.queryByText(new RegExp("如果這個 " + "email"))).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("button", { name: "前往登入" })).toBeVisible();
    expect(screen.getByRole("link", { name: "忘記密碼" })).toBeVisible();
  });
});

describe("AuthNotice", () => {
  it("shows only the credential text inside the alert", () => {
    renderWithI18n(
      <>
        <AuthNotice kind="invalid_credentials" email="buyer@example.com" />
        <Fields error={null} />
      </>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("email 或密碼不正確");
    expect(alert.querySelector("a")).toBeNull();
    expect(screen.getAllByRole("link", { name: "忘記密碼" })).toHaveLength(1);
  });

  it("uses the sign-in limit message for a 429 sign-in", () => {
    renderWithI18n(<AuthNotice kind="rate_limited" email="buyer@example.com" />);
    expect(screen.getByRole("alert")).toHaveTextContent("登入太頻繁，請等幾分鐘再試");
    expect(screen.queryByText("嘗試次數太多，請稍後再試")).toBeNull();
  });
});

describe("login text links", () => {
  it("stacks forgot password above the account switch and shares one link style", () => {
    renderWithI18n(<Fields />);
    const forgot = screen.getByRole("link", { name: "忘記密碼" });
    const switchMode = screen.getByRole("button", { name: "還沒有帳號？註冊" });
    expect(forgot.className).toBe(authTextLink);
    expect(switchMode.className).toBe(authTextLink);
    expect(forgot.parentElement).toBe(switchMode.parentElement);
    expect(forgot.parentElement).toHaveClass("flex-col");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("shows only the sign-in switch while signing up", () => {
    renderWithI18n(<Fields mode="signup" />);
    expect(screen.queryByRole("link", { name: "忘記密碼" })).toBeNull();
    expect(screen.getByRole("button", { name: "已有帳號？登入" })).toBeVisible();
  });
});

describe("ResendVerificationButton cooldown", () => {
  it("counts down after the first send and only warns if pressed again", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const onResend = vi.fn().mockResolvedValue("ok");
    renderWithI18n(
      <ResendVerificationButton email="buyer@example.com" label="signup" onResend={onResend} />,
    );

    await act(async () => {
      screen.getByRole("button", { name: "沒收到信？重新寄送" }).click();
    });
    await flushCooldown();
    expect(onResend).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("嘗試次數太多，請稍後再試")).toBeNull();
    expect(screen.getByRole("button", { name: /秒後可再寄送/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await act(async () => {
      screen.getByRole("button", { name: /秒後可再寄送/ }).click();
    });
    expect(onResend).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("嘗試次數太多，請稍後再試");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50_000);
    });
    expect(screen.queryByText("嘗試次數太多，請稍後再試")).toBeNull();
    const again = screen.getByRole("button", { name: "沒收到信？重新寄送" });
    expect(again).not.toHaveAttribute("aria-disabled", "true");
    await act(async () => {
      again.click();
    });
    await flushCooldown();
    expect(onResend).toHaveBeenCalledTimes(2);
  });

  it("treats a server rate limit as the same neutral resend and starts the cooldown", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const onResend = vi.fn().mockResolvedValue("rate_limited");
    renderWithI18n(
      <ResendVerificationButton email="buyer@example.com" label="signup" onResend={onResend} />,
    );
    await act(async () => {
      screen.getByRole("button", { name: "沒收到信？重新寄送" }).click();
    });
    await flushCooldown();
    expect(screen.getByRole("status")).toHaveTextContent("已重新寄出，請到信箱查看（含垃圾郵件）。");
    expect(screen.queryByText("嘗試次數太多，請稍後再試")).toBeNull();
    expect(screen.getByRole("button", { name: /秒後可再寄送/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("keeps the remaining time for the same email after a refresh", async () => {
    const onResend = vi.fn().mockResolvedValue("ok");
    const view = renderWithI18n(
      <ResendVerificationButton email="buyer@example.com" label="signup" onResend={onResend} />,
    );
    await act(async () => {
      screen.getByRole("button", { name: "沒收到信？重新寄送" }).click();
    });
    let storedKey = "";
    await vi.waitFor(() => {
      storedKey =
        Object.keys(window.localStorage).find((key) =>
          key.startsWith("kanfangji.authCooldown.signup."),
        ) ?? "";
      expect(storedKey).not.toBe("");
    });
    view.unmount();
    window.localStorage.setItem(storedKey, String(Date.now() + 40_000));
    renderWithI18n(
      <ResendVerificationButton email="buyer@example.com" label="signup" onResend={onResend} />,
    );
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: "40 秒後可再寄送" })).toBeVisible();
    });
    cleanup();
    renderWithI18n(
      <ResendVerificationButton email="other@example.com" label="signup" onResend={onResend} />,
    );
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: "沒收到信？重新寄送" })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });
  });

  it("stores the cooldown after unmount if the hash is still running", async () => {
    let release: ((value: ArrayBuffer) => void) | undefined;
    const digest = vi.spyOn(crypto.subtle, "digest").mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const onResend = vi.fn().mockResolvedValue("ok");
    const view = renderWithI18n(
      <ResendVerificationButton email="buyer@example.com" label="signup" onResend={onResend} />,
    );
    await act(async () => {
      screen.getByRole("button", { name: "沒收到信？重新寄送" }).click();
    });
    await vi.waitFor(() => {
      expect(release).toBeTypeOf("function");
    });
    view.unmount();
    const bytes = new Uint8Array(32).buffer;
    await act(async () => {
      release?.(bytes);
    });
    await vi.waitFor(() => {
      const stored = Object.keys(window.localStorage).some((key) =>
        key.startsWith("kanfangji.authCooldown.signup."),
      );
      expect(stored).toBe(true);
    });
    digest.mockRestore();
  });

  it("ignores extra presses during the cooldown", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const onResend = vi.fn().mockResolvedValue("ok");
    renderWithI18n(
      <ResendVerificationButton email="buyer@example.com" label="signup" onResend={onResend} />,
    );
    await act(async () => {
      screen.getByRole("button", { name: "沒收到信？重新寄送" }).click();
    });
    await flushCooldown();
    const button = screen.getByRole("button", { name: /秒後可再寄送/ });
    await act(async () => {
      for (let press = 0; press < 5; press += 1) button.click();
    });
    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it("shows a generic error and does not cool down when the request throws", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const onResend = vi.fn().mockRejectedValue(new Error("buyer@example.com offline"));
    renderWithI18n(
      <ResendVerificationButton email="buyer@example.com" label="signup" onResend={onResend} />,
    );
    await act(async () => {
      screen.getByRole("button", { name: "沒收到信？重新寄送" }).click();
    });
    await flushCooldown();
    expect(screen.getByRole("alert")).toHaveTextContent("暫時無法完成，請稍後再試");
    expect(screen.queryByText(/buyer@example.com/)).toBeNull();
    expect(screen.getByRole("button", { name: "沒收到信？重新寄送" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      Object.keys(window.localStorage).some((key) => key.startsWith("kanfangji.authCooldown.")),
    ).toBe(false);
  });

  it("keeps the email out of the storage key and drops expired entries", async () => {
    const expired = "kanfangji.authCooldown.signup.0123456789abcdef";
    const malformed = "kanfangji.authCooldown.signup.fedcba9876543210";
    const active = "kanfangji.authCooldown.recovery.aaaaaaaaaaaaaaaa";
    window.localStorage.setItem(expired, String(Date.now() - 1000));
    window.localStorage.setItem(malformed, "nope");
    window.localStorage.setItem(active, String(Date.now() + 120_000));
    const onResend = vi.fn().mockResolvedValue("ok");
    renderWithI18n(
      <ResendVerificationButton email="buyer@example.com" label="signup" onResend={onResend} />,
    );
    await flushCooldown();
    expect(window.localStorage.getItem(expired)).toBeNull();
    expect(window.localStorage.getItem(malformed)).toBeNull();
    expect(window.localStorage.getItem(active)).not.toBeNull();

    await act(async () => {
      screen.getByRole("button", { name: "沒收到信？重新寄送" }).click();
    });
    let stored: string[] = [];
    await vi.waitFor(() => {
      stored = Object.keys(window.localStorage).filter((key) =>
        key.startsWith("kanfangji.authCooldown.signup."),
      );
      expect(stored).toHaveLength(1);
    });
    expect(stored[0]).not.toContain("buyer@example.com");
    expect(stored[0]).toMatch(/^kanfangji\.authCooldown\.signup\.[0-9a-f]{16}$/);
  });

  it("syncs the countdown when another tab writes the same cooldown", async () => {
    const onResend = vi.fn().mockResolvedValue("ok");
    renderWithI18n(
      <>
        <ResendVerificationButton email="buyer@example.com" label="signup" onResend={onResend} />
        <ResendVerificationButton email="buyer@example.com" label="confirm" onResend={onResend} />
      </>,
    );
    await act(async () => {
      screen.getByRole("button", { name: "沒收到信？重新寄送" }).click();
    });
    let key = "";
    await vi.waitFor(() => {
      key =
        Object.keys(window.localStorage).find((entry) =>
          entry.startsWith("kanfangji.authCooldown.signup."),
        ) ?? "";
      expect(key).not.toBe("");
    });
    await vi.waitFor(() => {
      if (screen.queryAllByRole("button", { name: /秒後可再寄送/ }).length < 2) {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key,
            newValue: window.localStorage.getItem(key),
          }),
        );
      }
      expect(screen.getAllByRole("button", { name: /秒後可再寄送/ })).toHaveLength(2);
    });
    expect(screen.queryByRole("button", { name: "重新寄送驗證信" })).toBeNull();
  });
});
