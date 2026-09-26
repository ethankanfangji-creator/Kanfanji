// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
const capture = vi.fn();
const identify = vi.fn();
const reset = vi.fn();
const opt_in_capturing = vi.fn();
const opt_out_capturing = vi.fn();
const set_config = vi.fn();

vi.mock("posthog-js", () => ({
  default: {
    init,
    capture,
    identify,
    reset,
    opt_in_capturing,
    opt_out_capturing,
    set_config,
  },
}));

describe("analytics client", () => {
  beforeEach(() => {
    vi.resetModules();
    init.mockReset();
    capture.mockReset();
    identify.mockReset();
    reset.mockReset();
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
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

  it("does not load PostHog when consent is denied", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    localStorage.setItem("kanfangji.analytics.consent.v1", "denied");
    const analytics = await import("./client");
    await analytics.setAnalyticsConsent("denied");
    expect(init).not.toHaveBeenCalled();
    await analytics.setAnalyticsConsent("granted");
    await vi.waitFor(() => expect(init).toHaveBeenCalled());
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
});
