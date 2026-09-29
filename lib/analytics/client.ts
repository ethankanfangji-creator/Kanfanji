"use client";

import type { PostHogConfig } from "posthog-js";
import type { AnalyticsEvent } from "./events";
import {
  captureAllowed,
  disarmAnalyticsCapture,
  hasGlobalPrivacyControl,
  readAnalyticsConsent,
} from "./consent";
import { sanitizeEvent } from "./sanitize";

const URL_PROP =
  /^(?:\$)?(?:current_?url|pathname|referrer|referring_domain|initial_.+|session_entry_(?:url|host|pathname|referrer|referring_domain))$/i;
const LEAK_VALUE = /^https?:\/\//i;
const LEAK_PATH = /\/s\/|\/c\/|\/invite\/|\/auth\/reset/i;
const POSTHOG_STORAGE_KEY = /^(?:ph_|__ph_)/;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripUrlProps(properties: Record<string, unknown>) {
  for (const key of Object.keys(properties)) {
    const value = properties[key];
    if (URL_PROP.test(key) || /utm_/i.test(key)) {
      delete properties[key];
      continue;
    }
    if (typeof value === "string" && (LEAK_VALUE.test(value) || LEAK_PATH.test(value))) {
      delete properties[key];
    }
  }
}

/** First-touch URLs live in $set / $set_once, not only on the event itself. */
function scrubPersonBag(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const next = { ...value };
  stripUrlProps(next);
  return next;
}

function scrubCaptureEvent<
  T extends {
    properties?: Record<string, unknown>;
    $set?: Record<string, unknown>;
    $set_once?: Record<string, unknown>;
  } | null,
>(event: T): T {
  if (!event) return event;
  const properties = event.properties ? { ...event.properties } : undefined;
  if (properties) {
    stripUrlProps(properties);
    const nestedSet = scrubPersonBag(properties.$set);
    const nestedOnce = scrubPersonBag(properties.$set_once);
    if (nestedSet) properties.$set = nestedSet;
    if (nestedOnce) properties.$set_once = nestedOnce;
  }
  return {
    ...event,
    ...(properties ? { properties } : {}),
    ...(event.$set ? { $set: scrubPersonBag(event.$set) } : {}),
    ...(event.$set_once ? { $set_once: scrubPersonBag(event.$set_once) } : {}),
  };
}

/** Non-production diagnostics. Both default off. Vercel exposes NEXT_PUBLIC_VERCEL_ENV. */
function nonProductionFlag(value: string | undefined) {
  return value === "1" && process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";
}

function optInQuietly(posthog: PostHogLike) {
  if (posthog.has_opted_in_capturing()) return;
  posthog.opt_in_capturing({ captureEventName: false });
}

function cookieDomains(hostname: string): string[] {
  if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return [];
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length < 2) return [];
  return [parts.slice(1).join(".")];
}

/** Drop leftover PostHog keys. Does not touch kanfangji.analytics.consent.v1. */
export function clearPosthogStorage() {
  if (typeof window === "undefined") return;
  for (const store of [window.localStorage, window.sessionStorage]) {
    const doomed: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key && POSTHOG_STORAGE_KEY.test(key)) doomed.push(key);
    }
    for (const key of doomed) store.removeItem(key);
  }
  const names = new Set<string>();
  const token = analyticsKey();
  if (token) names.add(`ph_${token}_posthog`);
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name && POSTHOG_STORAGE_KEY.test(name)) names.add(name);
  }
  const domains = cookieDomains(window.location.hostname);
  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.${domain}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
  }
}

function exposeAutomationHooks() {
  if (typeof window === "undefined") return;
  if (!nonProductionFlag(process.env.NEXT_PUBLIC_ANALYTICS_ALLOW_AUTOMATION)) return;
  const host = window as Window & {
    __kfTrack?: typeof track;
    __kfIdentify?: typeof identify;
  };
  host.__kfTrack = track;
  host.__kfIdentify = identify;
}

async function loadClient(): Promise<PostHogLike | null> {
  if (!captureAllowed()) return null;
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
          save_referrer: false,
          save_campaign_params: false,
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
          before_send: (event) => scrubCaptureEvent(event),
        } satisfies Partial<PostHogConfig>;
        posthog.init(key, options);
        if (debugAnalytics && typeof window !== "undefined") {
          (window as Window & { __kfPosthog?: PostHogLike }).__kfPosthog = posthog;
        }
        if (captureAllowed()) optInQuietly(posthog);
        exposeAutomationHooks();
        client = posthog;
        ready = true;
        return posthog;
      })
      .catch(() => null);
  }
  return loading;
}

async function optOutLoadedClient() {
  const posthog = client ?? (loading ? await loading : null);
  if (!posthog) return;
  posthog.opt_out_capturing();
  posthog.reset();
  posthog.set_config({ persistence: "memory" });
}

export async function setAnalyticsConsent(value: "granted" | "denied") {
  if (hasGlobalPrivacyControl()) {
    clearPosthogStorage();
    return;
  }
  if (value === "denied") {
    if (client || loading) await optOutLoadedClient();
    clearPosthogStorage();
    return;
  }
  const posthog = await loadClient();
  if (!posthog) return;
  posthog.set_config({ persistence: "localStorage+cookie" });
  optInQuietly(posthog);
  exposeAutomationHooks();
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
  disarmAnalyticsCapture();
}

export function analyticsConsentSnapshot() {
  return readAnalyticsConsent();
}
