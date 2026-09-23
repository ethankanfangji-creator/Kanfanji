"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";

export default function OfflinePage() {
  const { messages } = useI18n();
  return (
    <div className="min-h-screen flex items-center justify-center px-5 text-center">
      <div className="max-w-sm rounded-[24px] border border-black/5 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">{messages.offline.fallbackTitle}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#4B5563]">
          {messages.offline.fallbackBody}
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-black px-5 text-sm font-bold text-white"
        >
          {messages.brand.name}
        </Link>
      </div>
    </div>
  );
}
