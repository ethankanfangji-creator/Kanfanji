"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/components/I18nProvider";

export function AuthPageShell({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children: ReactNode;
}) {
  const { messages } = useI18n();

  return (
    <div className="flex min-h-screen w-full justify-center bg-[#FAF6F1] text-[#1A1A1A]">
      <div className="relative my-auto w-full max-w-[420px] px-4 py-10">
        <p className="text-[11px] font-bold tracking-wide text-[#9CA3AF]">KANFANGJI</p>
        <h1 className="mt-2 text-[22px] font-bold leading-snug">{title}</h1>
        {body ? <p className="mt-2 text-[13px] leading-[1.5] text-[#6B7280]">{body}</p> : null}
        <div className="relative mt-6 rounded-[20px] border border-black/8 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
          {children}
        </div>
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-[12px] font-medium text-[#6B7280] underline-offset-2 hover:underline"
          >
            {messages.loginPage.backHome}
          </Link>
          <Link
            href="/privacy"
            className="ml-4 inline-flex min-h-11 items-center text-[12px] font-medium text-[#6B7280] underline-offset-2 hover:underline"
          >
            {messages.nav.privacy}
          </Link>
        </div>
      </div>
    </div>
  );
}
