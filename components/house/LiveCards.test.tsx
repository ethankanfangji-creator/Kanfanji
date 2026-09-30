// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveCards } from "./LiveCards";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

afterEach(() => {
  cleanup();
});

describe("LiveCards", () => {
  it("shows the shared code and cards without an end control or presence", () => {
    render(
      <LiveCards
        address="88 Main St"
        code="K7NP3Q"
        cards={[
          {
            templateId: "card-1",
            name: "採光",
            icon: "☀️",
            sortOrder: 2,
            isSystem: true,
            status: "good",
            notes: "窗邊很亮",
            voiceTranscript: "採光很好",
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "K7NP3Q" })).toBeInTheDocument();
    expect(screen.getByText("採光")).toBeInTheDocument();
    expect(screen.getByText("✅ 好")).toBeInTheDocument();
    expect(screen.getByText("窗邊很亮")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "結束" })).toBeNull();
    expect(screen.queryByText(/正在拍/)).toBeNull();
  });
});
