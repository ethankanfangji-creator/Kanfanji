"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { analyticsKey } from "@/lib/analytics/client";
import {
  hasGlobalPrivacyControl,
  readAnalyticsConsent,
} from "@/lib/analytics/consent";
import { applyAnalyticsConsent } from "@/lib/analytics/preferences";

export function ConsentBanner() {
  const { messages } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!analyticsKey()) return;
    if (hasGlobalPrivacyControl()) return;
    if (readAnalyticsConsent()) return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto w-full max-w-xl rounded-2xl border border-black/10 bg-white p-3 shadow-lg">
        <p className="text-[13px] leading-5 text-[#374151]">{messages.analytics.bannerBody}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="min-h-9 rounded-full bg-[#111111] px-3 text-[12px] font-bold text-white"
            onClick={() => {
              void applyAnalyticsConsent("granted");
              setVisible(false);
            }}
          >
            {messages.analytics.allow}
          </button>
          <button
            type="button"
            className="min-h-9 rounded-full border border-black/10 px-3 text-[12px] font-bold"
            onClick={() => {
              void applyAnalyticsConsent("denied");
              setVisible(false);
            }}
          >
            {messages.analytics.deny}
          </button>
          <Link
            href="/privacy"
            className="min-h-9 px-2 text-[12px] font-semibold text-[#6B7280] underline-offset-2 hover:underline"
          >
            {messages.analytics.privacyLink}
          </Link>
        </div>
      </div>
    </div>
  );
}
