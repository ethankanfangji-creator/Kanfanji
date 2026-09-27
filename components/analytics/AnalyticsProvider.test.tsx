// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsProvider } from "./AnalyticsProvider";

vi.mock("./ConsentBanner", () => ({
  ConsentBanner: () => null,
}));

const init = vi.fn();

vi.mock("posthog-js/no-external", () => ({
  default: {
    init,
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    set_config: vi.fn(),
    has_opted_in_capturing: () => false,
  },
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  }),
}));

describe("AnalyticsProvider", () => {
  beforeEach(async () => {
    init.mockReset();
    localStorage.clear();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    Object.defineProperty(navigator, "globalPrivacyControl", {
      configurable: true,
      value: false,
    });
    const client = await import("@/lib/analytics/client");
    client.__resetAnalyticsForTests();
  });

  it("does not init when consent is missing, denied, or blocked by GPC", async () => {
    const missing = render(
      <AnalyticsProvider>
        <div>app</div>
      </AnalyticsProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(init).not.toHaveBeenCalled();
    missing.unmount();

    localStorage.setItem("kanfangji.analytics.consent.v1", "denied");
    const denied = render(
      <AnalyticsProvider>
        <div>app</div>
      </AnalyticsProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(init).not.toHaveBeenCalled();
    denied.unmount();

    localStorage.setItem("kanfangji.analytics.consent.v1", "granted");
    Object.defineProperty(navigator, "globalPrivacyControl", {
      configurable: true,
      value: true,
    });
    render(
      <AnalyticsProvider>
        <div>app</div>
      </AnalyticsProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(init).not.toHaveBeenCalled();
  });

  it("inits once when stored consent is granted", async () => {
    localStorage.setItem("kanfangji.analytics.consent.v1", "granted");
    render(
      <AnalyticsProvider>
        <div>app</div>
      </AnalyticsProvider>,
    );
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));
  });
});
