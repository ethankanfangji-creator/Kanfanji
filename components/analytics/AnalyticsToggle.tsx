"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { analyticsKey } from "@/lib/analytics/client";
import { hasGlobalPrivacyControl } from "@/lib/analytics/consent";
import { applyAnalyticsConsent } from "@/lib/analytics/preferences";
import { getSupabase } from "@/lib/supabase";

export function AnalyticsToggle() {
  const { messages } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    if (!analyticsKey() || !supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      const consent = user?.user_metadata?.analytics_consent;
      setEnabled(consent === "granted" && !hasGlobalPrivacyControl());
      setReady(Boolean(user));
    });
  }, []);

  if (!ready) return null;

  return (
    <div className="px-1 py-1">
      <label className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-[12px] font-bold">
        <span>{messages.analytics.toggleLabel}</span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={hasGlobalPrivacyControl()}
          onChange={(event) => {
            const next = event.target.checked;
            setEnabled(next);
            void applyAnalyticsConsent(next ? "granted" : "denied");
          }}
        />
      </label>
      <Link
        href="/privacy"
        className="block px-2 pb-1 text-[11px] font-semibold text-[#6B7280] underline-offset-2 hover:underline"
      >
        {messages.nav.privacy}
      </Link>
    </div>
  );
}
