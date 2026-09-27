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
