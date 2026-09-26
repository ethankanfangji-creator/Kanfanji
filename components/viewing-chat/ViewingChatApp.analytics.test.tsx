// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/I18nProvider";

const track = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/analytics/client", () => ({
  track: (...args: unknown[]) => track(...args),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => null,
  isSupabaseConfigured: () => false,
}));

import { ViewingChatApp } from "./ViewingChatApp";

afterEach(() => {
  cleanup();
  track.mockReset();
});

beforeEach(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
});

describe("ViewingChatApp address analytics", () => {
  it("tracks reject and confirm without the address", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/address-suggest")) {
          return new Response(
            JSON.stringify({
              region: "CA",
              suggestions: [
                {
                  id: "place-1",
                  label: "100 Example Ave",
                  formatted: "100 Example Ave",
                  lat: 49.28,
                  lng: -123.12,
                  source: "google",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );

    render(
      <I18nProvider>
        <ViewingChatApp />
      </I18nProvider>,
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "100 Example");
    const option = await screen.findByRole("option");
    await user.click(option);

    await user.click(screen.getByRole("button", { name: "Wrong — search again" }));
    expect(track).toHaveBeenCalledWith({
      name: "address_rejected",
      props: { source: "google", region: "CA" },
    });
    const rejected = track.mock.calls.find((call) => call[0]?.name === "address_rejected");
    expect(JSON.stringify(rejected)).not.toContain("Example");

    await user.type(input, "100 Example");
    await user.click(await screen.findByRole("option"));
    await user.click(screen.getByRole("button", { name: "Use this address" }));
    const confirmed = track.mock.calls.find((call) => call[0]?.name === "address_confirmed");
    expect(confirmed?.[0]).toEqual({
      name: "address_confirmed",
      props: { source: "google", region: "CA" },
    });
    expect(JSON.stringify(confirmed)).not.toContain("Example");
  });
});
