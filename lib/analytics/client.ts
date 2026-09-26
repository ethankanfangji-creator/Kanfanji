"use client";

import type { AnalyticsEvent } from "./events";
import { captureAllowed, hasGlobalPrivacyControl, readAnalyticsConsent } from "./consent";
import { sanitizeEvent } from "./sanitize";

const URL_PROP =
  /^(?:\$)?(?:current_url|pathname|referrer|referring_domain|initial_.+)$/i;

type PostHogLike = {
  init: (key: string, options: Record<string, unknown>) => void;
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string) => void;
  reset: () => void;
  opt_in_capturing: () => void;
  opt_out_capturing: () => void;
  set_config: (config: Record<string, unknown>) => void;
};

let client: PostHogLike | null = null;
let loading: Promise<PostHogLike | null> | null = null;
let ready = false;

export function analyticsKey(): string | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  return key ? key : null;
}

function stripUrlProps(properties: Record<string, unknown> | undefined) {
  if (!properties) return;
  for (const key of Object.keys(properties)) {
    if (URL_PROP.test(key)) delete properties[key];
  }
}

async function loadClient(): Promise<PostHogLike | null> {
  const key = analyticsKey();
  if (!key) return null;
  if (client) return client;
  if (!loading) {
    loading = import("posthog-js")
      .then((mod) => {
        const posthog = mod.default as PostHogLike;
        const granted = captureAllowed();
        posthog.init(key, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          person_profiles: "identified_only",
          opt_out_capturing_by_default: true,
          persistence: granted ? "localStorage+cookie" : "memory",
          before_send: (event: { properties?: Record<string, unknown> } | null) => {
            if (!event) return event;
            stripUrlProps(event.properties);
            return event;
          },
          sanitize_properties: (properties: Record<string, unknown>) => {
            stripUrlProps(properties);
            return properties;
          },
        });
        if (granted) posthog.opt_in_capturing();
        client = posthog;
        ready = true;
        return posthog;
      })
      .catch(() => null);
  }
  return loading;
}

export async function setAnalyticsConsent(value: "granted" | "denied") {
  if (!analyticsKey() || hasGlobalPrivacyControl()) return;
  if (value !== "granted") {
    // A deny must not import posthog-js. Opt out only if Allow already loaded it.
    if (!client && !loading) return;
    const posthog = client ?? (await loading);
    if (!posthog) return;
    posthog.opt_out_capturing();
    posthog.reset();
    posthog.set_config({ persistence: "memory" });
    return;
  }
  const posthog = await loadClient();
  if (!posthog) return;
  posthog.set_config({ persistence: "localStorage+cookie" });
  posthog.opt_in_capturing();
}

export function track(event: AnalyticsEvent) {
  if (!analyticsKey() || !captureAllowed()) return;
  const clean = sanitizeEvent(event);
  if (!clean) return;
  void loadClient().then((posthog) => {
    if (!posthog || !captureAllowed()) return;
    posthog.capture(clean.name, clean.props as unknown as Record<string, unknown>);
  });
}

export function identify(userId: string) {
  if (!analyticsKey() || !captureAllowed() || !userId) return;
  void loadClient().then((posthog) => {
    if (!posthog || !captureAllowed()) return;
    posthog.identify(userId);
  });
}

export function resetAnalytics() {
  if (!analyticsKey() || !ready || !client) return;
  client.reset();
}

export function __resetAnalyticsForTests() {
  client = null;
  loading = null;
  ready = false;
}

export function analyticsConsentSnapshot() {
  return readAnalyticsConsent();
}
