// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { useState, type FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/I18nProvider";
import { LoginGateDialog, type LoginGateCopy } from "./LoginGateDialog";

afterEach(cleanup);

const copy: LoginGateCopy = {
  title: "Sign in",
  body: "Upload after login.",
  email: "Email",
  password: "Password",
  processing: "Working...",
  submitSignIn: "Sign in",
  submitSignUp: "Sign up",
  switchToSignUp: "Need an account?",
  switchToSignIn: "Have an account?",
  close: "Close",
  showPassword: "Show password",
  hidePassword: "Hide password",
  emailInvalid: "Enter a valid email",
  passwordTooShort: "Password must be at least 6 characters",
};

function Harness({
  onSubmit = vi.fn(),
  error = "",
}: {
  onSubmit?: (event: FormEvent) => void;
  error?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <I18nProvider>
      <LoginGateDialog
        open
        copy={copy}
        email={email}
        password={password}
        mode={mode}
        error={error}
        busy={false}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onModeChange={setMode}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    </I18nProvider>
  );
}

describe("LoginGateDialog focus stability", () => {
  it("keeps the same email input node while typing and deleting", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("id", "email");
    expect(email).toHaveAttribute("name", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toHaveFocus();

    const emailNode = email;
    await user.type(email, "buyer@example.com");
    expect(screen.getByLabelText("Email")).toBe(emailNode);
    expect(emailNode).toHaveFocus();
    expect(emailNode).toHaveValue("buyer@example.com");

    await user.type(emailNode, "{Backspace}{Backspace}{Backspace}{Backspace}");
    expect(screen.getByLabelText("Email")).toBe(emailNode);
    expect(emailNode).toHaveFocus();
    expect(emailNode).toHaveValue("buyer@example");
  });

  it("does not remount email when toggling password visibility", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const emailNode = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");
    await user.type(emailNode, "a@b.co");
    await user.type(password, "secret1");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Email")).toBe(emailNode);
    expect(emailNode).toHaveValue("a@b.co");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Email")).toBe(emailNode);
  });

  it("keeps email focus after submit error and continues typing", async () => {
    const user = userEvent.setup();

    function ErrorHarness() {
      const [email, setEmail] = useState("");
      const [password, setPassword] = useState("");
      const [mode, setMode] = useState<"signin" | "signup">("signin");
      const [error, setError] = useState("");

      return (
        <I18nProvider>
          <LoginGateDialog
            open
            copy={copy}
            email={email}
            password={password}
            mode={mode}
            error={error}
            busy={false}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onModeChange={setMode}
            onSubmit={(event) => {
              event.preventDefault();
              setError("Invalid login");
            }}
            onClose={vi.fn()}
          />
        </I18nProvider>
      );
    }

    render(<ErrorHarness />);
    const emailNode = screen.getByLabelText("Email");
    await user.type(emailNode, "ok@example.com");
    await user.type(screen.getByLabelText("Password"), "secret12");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid login");
    expect(screen.getByLabelText("Email")).toBe(emailNode);
    await user.type(emailNode, ".tw");
    expect(emailNode).toHaveFocus();
    expect(emailNode).toHaveValue("ok@example.com.tw");
  });

  it("runs full email validation on blur, not on every keystroke", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const email = screen.getByLabelText("Email");
    await user.type(email, "not-an-email");
    // Lightweight inline hint may appear while typing; full invalid state waits for blur.
    expect(email).not.toHaveAttribute("aria-invalid");

    await user.tab();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a valid email")).toBeVisible();
  });
});
