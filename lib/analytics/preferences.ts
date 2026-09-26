"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { setAnalyticsConsent } from "./client";
import {
  hasGlobalPrivacyControl,
  mirroredAnalyticsConsent,
  type AnalyticsConsent,
  writeAnalyticsConsent,
} from "./consent";

/**
 * Copy this device's effective consent onto the signed-in account.
 * Server events only see `user_metadata`, so a guest Allow, a deny, or
 * Global Privacy Control has to be written here — including at sign-in.
 */
export async function publishAnalyticsConsentToAccount(
  supabase: SupabaseClient | null = getSupabase(),
  metadata?: { analytics_consent?: unknown } | null,
): Promise<void> {
  if (!supabase) return;
  try {
    let current = metadata;
    if (current === undefined) {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      current = data.user.user_metadata;
    }
    const next = mirroredAnalyticsConsent();
    if ((current?.analytics_consent ?? null) === next) return;
    await supabase.auth.updateUser({ data: { analytics_consent: next } });
  } catch {
    // Consent mirroring must not block sign-in or the rest of the page.
  }
}

export async function applyAnalyticsConsent(value: AnalyticsConsent) {
  if (!hasGlobalPrivacyControl()) {
    writeAnalyticsConsent(value);
    await setAnalyticsConsent(value);
  }
  await publishAnalyticsConsentToAccount();
}
