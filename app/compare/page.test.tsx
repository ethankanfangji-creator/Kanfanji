// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/I18nProvider";
import { ChatComparePage } from "@/components/comparison/ChatComparePage";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const STORAGE_KEY = "kanfangji.viewingChat.threads.v1";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => {
  window.localStorage.setItem("kanfangji.locale", "zh-Hant");
});

describe("ChatComparePage", () => {
  it("shows a missing-device column without dropping the local thread", async () => {
    window.history.replaceState(null, "", "/compare?ids=thread-a,missing-id");
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "thread-a",
          address: "台北市松山區一號",
          normalizedAddress: "台北市松山區一號",
          createdAt: "2026-09-01T02:30:00.000Z",
          updatedAt: "2026-09-01T02:30:00.000Z",
          messages: [{ text: "價格 999 萬" }],
          report: null,
          metadata: null,
          propertyRecord: {
            mode: "collecting",
            updatedAt: "2026-09-01T02:30:00.000Z",
            fields: {
              price: {
                fieldId: "price",
                value: "880萬",
                status: "confirmed",
                confidence: 1,
                sourceMessageId: null,
                rawText: "880萬",
                updatedAt: "2026-09-01T02:30:00.000Z",
              },
            },
          },
        },
      ]),
    );

    render(
      <I18nProvider>
        <ChatComparePage />
      </I18nProvider>,
    );

    expect((await screen.findAllByText("此裝置找不到這筆紀錄")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("880萬").length).toBeGreaterThan(0);
    expect(screen.queryByText("999")).toBeNull();
  });

  it("shows the empty state when fewer than two ids are valid", async () => {
    window.history.replaceState(null, "", "/compare?ids=only-one");
    render(
      <I18nProvider>
        <ChatComparePage />
      </I18nProvider>,
    );
    expect(await screen.findByText("請從看房歷史選 2–3 筆再比較")).toBeTruthy();
    expect(screen.getByRole("link", { name: "回首頁" })).toBeTruthy();
  });
});
