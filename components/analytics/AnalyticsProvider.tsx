"use client";

import { useEffect } from "react";
import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { identify, resetAnalytics, setAnalyticsConsent } from "@/lib/analytics/client";
import { readAnalyticsConsent } from "@/lib/analytics/consent";
import { publishAnalyticsConsentToAccount } from "@/lib/analytics/preferences";
import { getSupabase } from "@/lib/supabase";

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const stored = readAnalyticsConsent();
    if (stored) void setAnalyticsConsent(stored);

    const supabase = getSupabase();
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        resetAnalytics();
        return;
      }
      if (
        session?.user?.id &&
        (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")
      ) {
        identify(session.user.id);
        const metadata = session.user.user_metadata;
        // Defer so updateUser does not run inside the auth lock.
        setTimeout(() => {
          void publishAnalyticsConsentToAccount(supabase, metadata);
        }, 0);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      {children}
      <ConsentBanner />
    </>
  );
}
