import "server-only";

import { PostHog } from "posthog-node";
import { createAdminClient } from "@/utils/supabase/admin";
import type { AnalyticsEvent } from "./events";
import { sanitizeEvent } from "./sanitize";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

async function consentGranted(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return false;
  return data.user.user_metadata?.analytics_consent === "granted";
}

/** Server events for signed-in users. Failures never affect the caller. */
export async function serverTrack(distinctId: string, event: AnalyticsEvent) {
  try {
    const posthog = getClient();
    if (!posthog || !distinctId) return;
    if (!(await consentGranted(distinctId))) return;
    const clean = sanitizeEvent(event);
    if (!clean) return;
    posthog.capture({
      distinctId,
      event: clean.name,
      properties: clean.props as unknown as Record<string, unknown>,
    });
    await posthog.flush();
  } catch {
    // Analytics must not change API responses.
  }
}
