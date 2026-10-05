// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/I18nProvider";
import { ViewingsIndex } from "./ViewingsIndex";
import type { ViewingListItem } from "@/lib/viewings/list-item";

afterEach(() => cleanup());

beforeEach(() => {
  window.localStorage.setItem("kanfangji.locale", "zh-Hant");
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function item(
  partial: Partial<ViewingListItem> & Pick<ViewingListItem, "id" | "address">,
): ViewingListItem {
  return {
    updated_at: "2026-10-02T12:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    photo_urls: [],
    video_urls: [],
    decisionStatus: null,
    hasReport: false,
    lat: null,
    lng: null,
    ...partial,
  };
}

describe("ViewingsIndex", () => {
  it("shows empty state when there are no viewings", () => {
    render(
      <I18nProvider>
        <ViewingsIndex viewings={[]} loading={false} error="" />
      </I18nProvider>,
    );
    expect(screen.getByText("還沒有看房紀錄。去現場記一筆吧。")).toBeTruthy();
  });

  it("filters by search and shows empty-search copy", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <ViewingsIndex
          viewings={[
            item({ id: "1", address: "1200 Westwood St, Coquitlam" }),
            item({ id: "2", address: "88 Main Street, Vancouver" }),
          ]}
          loading={false}
          error=""
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/Westwood/)).toBeTruthy();
    await user.type(screen.getByPlaceholderText("搜尋地址…"), "no-match-xyz");
    expect(
      await screen.findByText("沒有符合的看房。試試別的關鍵字或篩選。"),
    ).toBeTruthy();
  });

  it("filters by decision chip", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <ViewingsIndex
          viewings={[
            item({
              id: "1",
              address: "Liked Home",
              decisionStatus: "liked",
            }),
            item({
              id: "2",
              address: "Passed Home",
              decisionStatus: "passed",
            }),
          ]}
          loading={false}
          error=""
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: /喜歡/ }));
    expect(screen.getByText("Liked Home")).toBeTruthy();
    expect(screen.queryByText("Passed Home")).toBeNull();
  });

  it("uses OSM tile map cover when pin coords exist", () => {
    const { container } = render(
      <I18nProvider>
        <ViewingsIndex
          viewings={[
            item({
              id: "1",
              address: "1167 Victory Drive",
              photo_urls: ["user/1/photos/a.jpg"],
              lat: 49.28,
              lng: -122.85,
            }),
          ]}
          loading={false}
          error=""
        />
      </I18nProvider>,
    );
    const tile = container.querySelector(
      'img[src^="https://tile.openstreetmap.org/"]',
    );
    expect(tile).toBeTruthy();
  });
});
