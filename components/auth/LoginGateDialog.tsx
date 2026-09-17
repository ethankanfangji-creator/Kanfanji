"use client";

import type { FormEvent } from "react";
import { X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";

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
};

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
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={copy.title}
      description={copy.body}
      backdropClassName="z-50 backdrop-blur-[2px] overflow-auto"
      className="relative"
    >
      <button
        type="button"
        aria-label={copy.close}
        onClick={onClose}
        className="absolute right-4 top-4 min-w-11 min-h-11 rounded-full bg-[#F5F3F0] flex items-center justify-center"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block text-[12px] font-bold">
          {copy.email}
          <input
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            className="mt-1.5 w-full h-12 px-4 rounded-full bg-[#F8F4EF] border border-black/5 text-[16px] outline-none"
          />
        </label>
        <label className="block text-[12px] font-bold">
          {copy.password}
          <input
            type="password"
            required
            minLength={6}
            maxLength={128}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            className="mt-1.5 w-full h-12 px-4 rounded-full bg-[#F8F4EF] border border-black/5 text-[16px] outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full h-12 rounded-full bg-black text-white text-[14px] font-bold disabled:opacity-60"
        >
          {busy
            ? copy.processing
            : mode === "signin"
              ? copy.submitSignIn
              : copy.submitSignUp}
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-3 text-[12px] text-[#991B1B] leading-[1.4]">
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
    </Dialog>
  );
}
