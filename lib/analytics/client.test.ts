// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
const capture = vi.fn();
const identify = vi.fn();
const reset = vi.fn();
const opt_in_capturing = vi.fn();
const opt_out_capturing = vi.fn();
const set_config = vi.fn();
const has_opted_in_capturing = vi.fn(() => false);

vi.mock("posthog-js/no-external", () => ({
  default: {
    init,
    capture,
    identify,
    reset,
    opt_in_capturing,
    opt_out_capturing,
    set_config,
    has_opted_in_capturing,
  },
}));

const DISABLED_FLAGS = {
  autocapture: false,
  capture_pageview: false,
  capture_pageleave: false,
  disable_session_recording: true,
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
} as const;

describe("analytics client", () => {
  beforeEach(() => {
    vi.resetModules();
    init.mockReset();
    capture.mockReset();
    identify.mockReset();
    reset.mockReset();
    opt_in_capturing.mockReset();
    opt_out_capturing.mockReset();
    set_config.mockReset();
    has_opted_in_capturing.mockReset();
    has_opted_in_capturing.mockReturnValue(false);
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    delete process.env.NEXT_PUBLIC_ANALYTICS_DEBUG;
    delete process.env.NEXT_PUBLIC_ANALYTICS_ALLOW_AUTOMATION;
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    delete (window as Window & { __kfPosthog?: unknown }).__kfPosthog;
    localStorage.clear();
    Object.defineProperty(navigator, "globalPrivacyControl", {
      configurable: true,
      value: false,
    });
  });

  it("does not load PostHog when the key is missing", async () => {
    const analytics = await import("./client");
    analytics.track({ name: "paywall_shown", props: { trigger: "ai_quota" } });
    await Promise.resolve();
    expect(init).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("does not send before consent", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    const analytics = await import("./client");
    analytics.track({ name: "paywall_shown", props: { trigger: "ai_quota" } });
    await vi.waitFor(() => expect(init).not.toHaveBeenCalled());
    expect(capture).not.toHaveBeenCalled();
  });

  it("does not send when Global Privacy Control is on", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    localStorage.setItem("kanfangji.analytics.consent.v1", "granted");
    Object.defineProperty(navigator, "globalPrivacyControl", {
      configurable: true,
      value: true,
    });
    const analytics = await import("./client");
    analytics.track({ name: "paywall_shown", props: { trigger: "ai_quota" } });
    await Promise.resolve();
    expect(capture).not.toHaveBeenCalled();
  });

  it("resets on logout when the client was loaded", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    localStorage.setItem("kanfangji.analytics.consent.v1", "granted");
    const analytics = await import("./client");
    analytics.identify("user-1");
    await vi.waitFor(() => expect(init).toHaveBeenCalled());
    analytics.resetAnalytics();
    expect(reset).toHaveBeenCalled();
  });

  it("initializes with remote extras off and no deprecated sanitize_properties", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    localStorage.setItem("kanfangji.analytics.consent.v1", "granted");
    const analytics = await import("./client");
    analytics.identify("user-1");
    await vi.waitFor(() => expect(init).toHaveBeenCalled());
    const options = init.mock.calls[0][1];
    expect(options).toEqual(expect.objectContaining(DISABLED_FLAGS));
    expect(options).not.toHaveProperty("sanitize_properties");
    expect(options).not.toHaveProperty("cookieless_mode");
    expect(options.save_referrer).toBe(false);
    expect(options.save_campaign_params).toBe(false);
    expect(options.opt_out_useragent_filter).toBe(false);
    expect(options.debug).toBe(false);
    expect(window.__kfPosthog).toBeUndefined();
  });

  it("opts out of the user-agent filter only outside production", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    process.env.NEXT_PUBLIC_ANALYTICS_ALLOW_AUTOMATION = "1";
    localStorage.setItem("kanfangji.analytics.consent.v1", "granted");
    const analytics = await import("./client");
    analytics.identify("user-1");
    await vi.waitFor(() => expect(init).toHaveBeenCalled());
    expect(init.mock.calls[0][1].opt_out_useragent_filter).toBe(true);

    vi.resetModules();
    init.mockClear();
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    const production = await import("./client");
    production.identify("user-1");
    await vi.waitFor(() => expect(init).toHaveBeenCalled());
    expect(init.mock.calls[0][1].opt_out_useragent_filter).toBe(false);
  });

  it("exposes the debug instance only outside production", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    process.env.NEXT_PUBLIC_ANALYTICS_DEBUG = "1";
    localStorage.setItem("kanfangji.analytics.consent.v1", "granted");
    const analytics = await import("./client");
    analytics.identify("user-1");
    await vi.waitFor(() => expect(init).toHaveBeenCalled());
    expect(init.mock.calls[0][1].debug).toBe(true);
    expect(window.__kfPosthog).toBeDefined();

    vi.resetModules();
    init.mockClear();
    delete (window as Window & { __kfPosthog?: unknown }).__kfPosthog;
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    const production = await import("./client");
    production.identify("user-1");
    await vi.waitFor(() => expect(init).toHaveBeenCalled());
    expect(init.mock.calls[0][1].debug).toBe(false);
    expect(window.__kfPosthog).toBeUndefined();
  });

  it("strips first-touch URLs from $set_once after identify", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    localStorage.setItem("kanfangji.analytics.consent.v1", "granted");
    const analytics = await import("./client");
    analytics.identify("user-1");
    await vi.waitFor(() => expect(init).toHaveBeenCalled());
    const beforeSend = init.mock.calls[0][1].before_send as (
      event: {
        event: string;
        properties: Record<string, unknown>;
        $set_once?: Record<string, unknown>;
      } | null,
    ) => {
      properties: Record<string, unknown>;
      $set_once?: Record<string, unknown>;
    } | null;
    const viewing = "https://kanfanji.vercel.app/viewings/secret";
    const sent = beforeSend({
      event: "$identify",
      properties: {
        $current_url: viewing,
        distinct_id: "user-1",
        $set_once: {
          $initial_current_url: viewing,
          $initial_referrer: "https://example.com/from",
          $initial_pathname: "/viewings/secret",
          $browser: "Chrome",
        },
      },
        $set_once: {
        $initial_current_url: viewing,
        $initial_referring_domain: "example.com",
        $browser: "Chrome",
      },
    });
    expect(sent).not.toBeNull();
    expect(sent?.properties.$current_url).toBeUndefined();
    expect(sent?.properties.distinct_id).toBe("user-1");
    const nested = sent?.properties.$set_once as Record<string, unknown>;
    expect(nested.$initial_current_url).toBeUndefined();
    expect(nested.$initial_referrer).toBeUndefined();
    expect(nested.$initial_pathname).toBeUndefined();
    expect(nested.$browser).toBe("Chrome");
    expect(sent?.$set_once?.$initial_current_url).toBeUndefined();
    expect(sent?.$set_once?.$initial_referring_domain).toBeUndefined();
    expect(sent?.$set_once?.$browser).toBe("Chrome");

    const scrubbed = beforeSend({
      event: "address_search_started",
      properties: {
        $host: "127.0.0.1:3200",
        region: "CA",
        note: "https://preview.example/s/abc123",
        $set: { $initial_current_url: viewing, plain: "ok" },
        $set_once: { $initial_pathname: "/viewings/secret", region: "US" },
      },
      $set: { leaked: "https://example.com/invite/x", $browser: "Chrome" },
      $set_once: { reset: "/auth/reset?code=1", region: "TW", utm_source: null },
    });
    expect(scrubbed).not.toBeNull();
    expect(scrubbed?.properties.$host).toBe("127.0.0.1:3200");
    expect(scrubbed?.properties.region).toBe("CA");
    expect(scrubbed?.properties.note).toBeUndefined();
    expect((scrubbed?.properties.$set as Record<string, unknown>).$initial_current_url).toBeUndefined();
    expect((scrubbed?.properties.$set as Record<string, unknown>).plain).toBe("ok");
    expect((scrubbed?.properties.$set_once as Record<string, unknown>).$initial_pathname).toBeUndefined();
    expect(scrubbed?.$set?.leaked).toBeUndefined();
    expect(scrubbed?.$set?.$browser).toBe("Chrome");
    expect(scrubbed?.$set_once?.reset).toBeUndefined();
    expect(scrubbed?.$set_once?.region).toBe("TW");
    expect(scrubbed?.$set_once?.utm_source).toBeUndefined();
  });

  it("does not load PostHog when consent is denied and clears leftover keys", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    localStorage.setItem("kanfangji.analytics.consent.v1", "denied");
    localStorage.setItem("ph_phc_x_posthog", "1");
    localStorage.setItem("__ph_opt_in_out_phc_x", "1");
    const analytics = await import("./client");
    await analytics.setAnalyticsConsent("denied");
    expect(init).not.toHaveBeenCalled();
    expect(localStorage.getItem("ph_phc_x_posthog")).toBeNull();
    expect(localStorage.getItem("__ph_opt_in_out_phc_x")).toBeNull();
    expect(localStorage.getItem("kanfangji.analytics.consent.v1")).toBe("denied");
  });

  it("opts in at most once and skips the $opt_in event", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    localStorage.setItem("kanfangji.analytics.consent.v1", "granted");
    has_opted_in_capturing.mockImplementation(() => opt_in_capturing.mock.calls.length > 0);
    const analytics = await import("./client");
    analytics.identify("user-1");
    await vi.waitFor(() => expect(opt_in_capturing).toHaveBeenCalledTimes(1));
    await analytics.setAnalyticsConsent("granted");
    expect(opt_in_capturing).toHaveBeenCalledTimes(1);
    expect(opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false });
  });
});
