"use client";

import { useRef, useState, type FormEvent, type RefObject } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export type LoginGateCopy = {
  title: string;
  body: string;
  email: string;
  password: string;
  processing: string;
  submitSignIn: string;
  submitSignUp: string;
  switchToSignUp: string;
  switchToSignIn: string;
  close: string;
  showPassword: string;
  hidePassword: string;
  emailInvalid: string;
  passwordTooShort: string;
};

function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  // Lightweight inline hint — not a full RFC check.
  return trimmed.includes("@") && trimmed.indexOf("@") < trimmed.length - 1;
}

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** Shared login / signup fields — same UI for gate dialog and /login page. */
export function LoginAuthFields({
  copy,
  email,
  password,
  mode,
  error,
  busy,
  emailInputRef,
  showClose,
  onEmailChange,
  onPasswordChange,
  onModeChange,
  onSubmit,
  onClose,
}: {
  copy: LoginGateCopy;
  email: string;
  password: string;
  mode: "signin" | "signup";
  error: string;
  busy: boolean;
  emailInputRef?: RefObject<HTMLInputElement | null>;
  showClose?: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onModeChange: (mode: "signin" | "signup") => void;
  onSubmit: (event: FormEvent) => void;
  onClose?: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const showFullEmailError =
    (emailTouched || submitted) && email.trim().length > 0 && !isValidEmail(email);
  const showLightEmailHint =
    !showFullEmailError && email.length > 0 && !looksLikeEmail(email);
  const showPasswordError =
    (passwordTouched || submitted) && password.length > 0 && password.length < 6;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setEmailTouched(true);
    setPasswordTouched(true);
    if (!isValidEmail(email) || password.length < 6) {
      return;
    }
    onSubmit(event);
  }

  return (
    <>
      {showClose && onClose ? (
        <button
          type="button"
          aria-label={copy.close}
          onClick={onClose}
          className="absolute right-4 top-4 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#F5F3F0]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}

      <div className={showClose ? "mt-2" : ""}>
        <LanguageSwitcher />
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3" noValidate>
        <div className="block text-[12px] font-bold">
          <label htmlFor="email">{copy.email}</label>
          <input
            ref={emailInputRef}
            id="email"
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={showFullEmailError || undefined}
            aria-describedby={
              showFullEmailError || showLightEmailHint ? "email-hint" : undefined
            }
            className="mt-1.5 h-12 w-full rounded-full border border-black/5 bg-[#F8F4EF] px-4 text-[16px] outline-none"
          />
          {showFullEmailError || showLightEmailHint ? (
            <p
              id="email-hint"
              className={`mt-1.5 text-[11px] font-medium ${
                showFullEmailError ? "text-[#991B1B]" : "text-[#6B7280]"
              }`}
            >
              {copy.emailInvalid}
            </p>
          ) : null}
        </div>

        <div className="block text-[12px] font-bold">
          <label htmlFor="password">{copy.password}</label>
          <div className="relative mt-1.5">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              maxLength={128}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              onBlur={() => setPasswordTouched(true)}
              aria-invalid={showPasswordError || undefined}
              aria-describedby={showPasswordError ? "password-hint" : undefined}
              className="h-12 w-full rounded-full border border-black/5 bg-[#F8F4EF] px-4 pr-12 text-[16px] outline-none"
            />
            <button
              type="button"
              className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[#6B7280]"
              aria-label={showPassword ? copy.hidePassword : copy.showPassword}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {showPasswordError ? (
            <p id="password-hint" className="mt-1.5 text-[11px] font-medium text-[#991B1B]">
              {copy.passwordTooShort}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="h-12 w-full rounded-full bg-black text-[14px] font-bold text-white disabled:opacity-60"
        >
          {busy
            ? copy.processing
            : mode === "signin"
              ? copy.submitSignIn
              : copy.submitSignUp}
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-3 text-[12px] leading-[1.4] text-[#991B1B]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => onModeChange(mode === "signin" ? "signup" : "signin")}
        className="mt-4 min-h-11 text-[12px] font-medium text-[#6B7280]"
      >
        {mode === "signin" ? copy.switchToSignUp : copy.switchToSignIn}
      </button>
    </>
  );
}

export function LoginGateDialog({
  open,
  copy,
  email,
  password,
  mode,
  error,
  busy,
  onEmailChange,
  onPasswordChange,
  onModeChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  copy: LoginGateCopy;
  email: string;
  password: string;
  mode: "signin" | "signup";
  error: string;
  busy: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onModeChange: (mode: "signin" | "signup") => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  const emailInputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={copy.title}
      description={copy.body}
      backdropClassName="z-50 backdrop-blur-[2px] overflow-auto"
      className="relative"
      initialFocusRef={emailInputRef}
    >
      {open ? (
        <LoginAuthFields
          copy={copy}
          email={email}
          password={password}
          mode={mode}
          error={error}
          busy={busy}
          emailInputRef={emailInputRef}
          showClose
          onEmailChange={onEmailChange}
          onPasswordChange={onPasswordChange}
          onModeChange={onModeChange}
          onSubmit={onSubmit}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}
