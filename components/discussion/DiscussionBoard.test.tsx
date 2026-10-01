// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscussionBoard } from "./DiscussionBoard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

describe("DiscussionBoard", () => {
  it("shows status and the first photo, then the card note and transcript", async () => {
    const user = userEvent.setup();
    render(
      <DiscussionBoard
        shareCode="K7NP3Q"
        houses={[{ id: "house-1", address: "88 Main" }]}
        rows={[
          {
            templateId: "light",
            name: "採光",
            icon: "☀️",
            cells: {
              "house-1": {
                cardId: "card-1",
                status: "good",
                notes: "窗邊很亮",
                voiceTranscript: "採光很好",
                photoUrls: ["https://example.test/a.jpg", "https://example.test/b.jpg"],
              },
            },
          },
        ]}
        comments={[{ id: "c1", cardId: "card-1", nickname: "家人", content: "同意", vote: "like" }]}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "88 Main" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "✅ 好" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "✅ 好" }));
    expect(screen.getByText("窗邊很亮")).toBeInTheDocument();
    expect(screen.getByText("採光很好")).toBeInTheDocument();
    expect(screen.getByText("同意")).toBeInTheDocument();
  });
});