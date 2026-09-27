"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { analyticsKey } from "@/lib/analytics/client";
import {
  hasGlobalPrivacyControl,
  readAnalyticsConsent,
} from "@/lib/analytics/consent";
import { applyAnalyticsConsent } from "@/lib/analytics/preferences";

const buttonClass =
  "min-h-11 flex-1 rounded-full border border-[#111111] bg-white px-3 text-[14px] font-bold text-[#111111]";

export function ConsentBanner() {
  const { messages } = useI18n();
  const pathname = usePathname();
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!analyticsKey() || hasGlobalPrivacyControl() || readAnalyticsConsent()) {
      setVisible(false);
      return;
    }
    setVisible(pathname !== "/privacy");
  }, [pathname]);

  useEffect(() => {
    if (!visible) return;
    const root = dialogRef.current;
    root?.querySelector("button")?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>("button, a[href]")];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible]);

  if (!visible) return null;

  const [before, after = ""] = messages.analytics.consentBody.split("{privacyLink}");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-lg"
      >
        <h2 id={titleId} className="text-[15px] font-bold leading-6 text-[#111111]">
          {messages.analytics.allow}
        </h2>
        <p id={bodyId} className="mt-2 text-[14px] leading-6 text-[#374151]">
          {before}
          <Link href="/privacy" className="font-semibold underline underline-offset-2">
            {messages.analytics.privacyLink}
          </Link>
          {after}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              void applyAnalyticsConsent("denied");
              setVisible(false);
            }}
          >
            {messages.analytics.deny}
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              void applyAnalyticsConsent("granted");
              setVisible(false);
            }}
          >
            {messages.analytics.allow}
          </button>
        </div>
      </div>
    </div>
  );
}
