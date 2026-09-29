// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsProvider } from "./AnalyticsProvider";

const init = vi.fn();
const auth = vi.hoisted(() => ({
  listener: null as
    | ((event: string, session: { user?: { id: string; user_metadata?: Record<string, unknown> } } | null) => void)
    | null,
}));

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
      onAuthStateChange: (listener: typeof auth.listener) => {
        auth.listener = listener;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  }),
}));

describe("AnalyticsProvider", () => {
  beforeEach(async () => {
    init.mockReset();
    auth.listener = null;
    localStorage.clear();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    Object.defineProperty(navigator, "globalPrivacyControl", {
      configurable: true,
      value: false,
    });
    const client = await import("@/lib/analytics/client");
    client.__resetAnalyticsForTests();
    const consent = await import("@/lib/analytics/consent");
    consent.disarmAnalyticsCapture();
  });

  it("does not init for a guest, even when an old local grant is stored", async () => {
    localStorage.setItem("kanfangji.analytics.consent.v1", "granted");
    render(
      <AnalyticsProvider>
        <div>app</div>
      </AnalyticsProvider>,
    );
    auth.listener?.("INITIAL_SESSION", null);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(init).not.toHaveBeenCalled();
  });

  it("does not init when the signed-in account has no grant", async () => {
    localStorage.setItem("kanfangji.analytics.consent.v1", "granted");
    render(
      <AnalyticsProvider>
        <div>app</div>
      </AnalyticsProvider>,
    );
    auth.listener?.("SIGNED_IN", {
      user: { id: "user-1", user_metadata: { analytics_consent: "denied" } },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(init).not.toHaveBeenCalled();
    expect(localStorage.getItem("kanfangji.analytics.consent.v1")).toBe("denied");
  });

  it("inits once when the signed-in account granted analytics", async () => {
    render(
      <AnalyticsProvider>
        <div>app</div>
      </AnalyticsProvider>,
    );
    auth.listener?.("INITIAL_SESSION", {
      user: { id: "user-1", user_metadata: { analytics_consent: "granted" } },
    });
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1));
  });
});
