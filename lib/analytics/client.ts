"use client";

import type { PostHogConfig } from "posthog-js";
import type { AnalyticsEvent } from "./events";
import { captureAllowed, hasGlobalPrivacyControl, readAnalyticsConsent } from "./consent";
import { sanitizeEvent } from "./sanitize";

const URL_PROP =
  /^(?:\$)?(?:current_url|pathname|referrer|referring_domain|initial_.+|session_entry_(?:url|host|pathname|referrer|referring_domain))$/i;

type PostHogLike = {
  init: (key: string, options: Partial<PostHogConfig>) => void;
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string) => void;
  reset: () => void;
  has_opted_in_capturing: () => boolean;
  opt_in_capturing: (options?: { captureEventName?: string | null | false }) => void;
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

function stripUrlProps(properties: Record<string, unknown>) {
  for (const key of Object.keys(properties)) {
    if (URL_PROP.test(key)) delete properties[key];
  }
}

/** Non-production diagnostics. Both default off. Vercel exposes NEXT_PUBLIC_VERCEL_ENV. */
function nonProductionFlag(value: string | undefined) {
  return value === "1" && process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";
}

function optInQuietly(posthog: PostHogLike) {
  if (posthog.has_opted_in_capturing()) return;
  posthog.opt_in_capturing({ captureEventName: false });
}

async function loadClient(): Promise<PostHogLike | null> {
  const key = analyticsKey();
  if (!key) return null;
  if (client) return client;
  if (!loading) {
    loading = import("posthog-js/no-external")
      .then((mod) => {
        const posthog = mod.default as PostHogLike;
        const granted = captureAllowed();
        const debugAnalytics = nonProductionFlag(process.env.NEXT_PUBLIC_ANALYTICS_DEBUG);
        const allowAutomation = nonProductionFlag(
          process.env.NEXT_PUBLIC_ANALYTICS_ALLOW_AUTOMATION,
        );
        const options = {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          person_profiles: "identified_only",
          opt_out_capturing_by_default: true,
          persistence: granted ? "localStorage+cookie" : "memory",
          advanced_disable_flags: true,
          disable_external_dependency_loading: true,
          disable_surveys: true,
          disable_product_tours: true,
          disable_conversations: true,
          disable_web_experiments: true,
          capture_dead_clicks: false,
          capture_performance: false,
          capture_heatmaps: false,
          capture_exceptions: false,
          opt_out_useragent_filter: allowAutomation,
          debug: debugAnalytics,
          disable_compression: allowAutomation,
          before_send: (event) => {
            if (!event?.properties) return event;
            const properties = { ...event.properties };
            stripUrlProps(properties);
            return { ...event, properties };
          },
        } satisfies Partial<PostHogConfig>;
        posthog.init(key, options);
        if (debugAnalytics && typeof window !== "undefined") {
          (window as Window & { __kfPosthog?: PostHogLike }).__kfPosthog = posthog;
        }
        if (granted) optInQuietly(posthog);
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
  const posthog = await loadClient();
  if (!posthog) return;
  if (value === "granted") {
    posthog.set_config({ persistence: "localStorage+cookie" });
    optInQuietly(posthog);
  } else {
    posthog.opt_out_capturing();
    posthog.reset();
    posthog.set_config({ persistence: "memory" });
  }
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
