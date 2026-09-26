"use client";

import { getSupabase } from "@/lib/supabase";
import { setAnalyticsConsent } from "./client";
import {
  hasGlobalPrivacyControl,
  type AnalyticsConsent,
  writeAnalyticsConsent,
} from "./consent";

export async function applyAnalyticsConsent(value: AnalyticsConsent) {
  if (hasGlobalPrivacyControl()) return;
  writeAnalyticsConsent(value);
  await setAnalyticsConsent(value);
  const supabase = getSupabase();
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.auth.updateUser({ data: { analytics_consent: value } });
}
