"use client";

import { useEffect } from "react";
import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { identify, resetAnalytics, setAnalyticsConsent } from "@/lib/analytics/client";
import { readAnalyticsConsent } from "@/lib/analytics/consent";
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
