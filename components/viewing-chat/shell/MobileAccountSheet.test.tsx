// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/I18nProvider";
import { MobileAccountSheet } from "./MobileAccountSheet";

afterEach(() => cleanup());

beforeEach(() => {
  window.localStorage.setItem("kanfangji.locale", "zh-Hant");
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
  getSupabase: () => null,
}));

vi.mock("@/components/notifications/NotificationsBell", () => ({
  NotificationsBell: () => <div>NotificationsBell</div>,
}));

describe("MobileAccountSheet", () => {
  it("links to viewings list and shares hub", () => {
    render(
      <I18nProvider>
        <MobileAccountSheet open onClose={() => undefined} />
      </I18nProvider>,
    );

    expect(screen.getByRole("link", { name: /看房列表/ })).toHaveAttribute(
      "href",
      "/viewings",
    );
    expect(screen.getByRole("link", { name: /分享中心/ })).toHaveAttribute(
      "href",
      "/shares",
    );
  });
});
