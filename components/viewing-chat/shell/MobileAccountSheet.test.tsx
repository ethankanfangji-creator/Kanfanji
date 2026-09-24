// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileAccountSheet } from "./MobileAccountSheet";

vi.mock("@/components/I18nProvider", () => ({
  useI18n: () => ({
    locale: "en",
    messages: {
      nav: {
        signIn: "Sign in",
        signOut: "Sign out",
        contactSupport: "Contact support",
      },
      chat: {
        searchClose: "Close",
        guestPlanTitle: "Guest plan",
        guestPlanBody:
          "Without signing in, this device keeps {guestLimit} viewing. Sign in for up to {freeLimit} free cloud homes.",
        guestPlanCta: "Learn about free & Pro",
      },
      paywall: {
        body: "Upgrade to Pro for unlimited viewings and cloud sync.",
      },
    },
  }),
}));

vi.mock("@/components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div>Language</div>,
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
  getSupabase: () => null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

afterEach(() => cleanup());

describe("MobileAccountSheet guest plan entry", () => {
  it("exposes a guest plan explainer for signed-out users", async () => {
    const user = userEvent.setup();
    render(<MobileAccountSheet open onClose={vi.fn()} />);

    expect(screen.getByText("Guest plan")).toBeTruthy();
    expect(screen.getByText("Learn about free & Pro")).toBeTruthy();

    await user.click(screen.getByText("Learn about free & Pro"));
    expect(screen.getByText(/keeps 1 viewing/i)).toBeTruthy();
    expect(screen.getByText(/up to 3 free cloud homes/i)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Sign in" }).length).toBeGreaterThan(0);
  });
});
