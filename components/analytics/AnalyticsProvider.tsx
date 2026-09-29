"use client";

import { useEffect } from "react";
import {
  clearPosthogStorage,
  identify,
  resetAnalytics,
  setAnalyticsConsent,
} from "@/lib/analytics/client";
import {
  hasGlobalPrivacyControl,
  writeAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analytics/consent";
import { getSupabase } from "@/lib/supabase";

function accountAnalyticsConsent(metadata: unknown): AnalyticsConsent | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as { analytics_consent?: unknown }).analytics_consent;
  return value === "granted" || value === "denied" ? value : null;
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    clearPosthogStorage();
    const supabase = getSupabase();
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        writeAnalyticsConsent("denied");
        resetAnalytics();
        void setAnalyticsConsent("denied");
        return;
      }
      const user = session?.user;
      if (
        !user ||
        (event !== "SIGNED_IN" && event !== "INITIAL_SESSION" && event !== "TOKEN_REFRESHED")
      ) {
        return;
      }
      const consent = accountAnalyticsConsent(user.user_metadata);
      if (consent === "granted" && !hasGlobalPrivacyControl()) {
        writeAnalyticsConsent("granted");
        void setAnalyticsConsent("granted").then(() => identify(user.id));
        return;
      }
      writeAnalyticsConsent("denied");
      void setAnalyticsConsent("denied");
    });
    return () => subscription.unsubscribe();
  }, []);

  return children;
}
