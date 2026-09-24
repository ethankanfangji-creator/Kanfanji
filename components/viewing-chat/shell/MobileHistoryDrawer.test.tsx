// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileHistoryDrawer } from "./MobileHistoryDrawer";
import type { ViewingChatThread } from "@/lib/viewing-chat/types";

afterEach(() => cleanup());

const labels = {
  title: "Viewing history",
  empty: "No records",
  close: "Close",
  pin: "Pin",
  unpin: "Unpin",
  delete: "Delete",
};

function thread(partial: Partial<ViewingChatThread> & { id: string }): ViewingChatThread {
  const now = new Date().toISOString();
  const { id, address = "123 Main St", ...rest } = partial;
  return {
    id,
    address,
    normalizedAddress: address,
    messages: [],
    updatedAt: now,
    createdAt: now,
    pinned: false,
    report: null,
    metadata: null,
    ...rest,
  };
}

describe("MobileHistoryDrawer", () => {
  it("renders as a bottom-sheet dialog when open", () => {
    render(
      <MobileHistoryDrawer
        open
        threads={[thread({ id: "t1", address: "Taipei 101" })]}
        activeId={null}
        onClose={vi.fn()}
        onSelectThread={vi.fn()}
        onDeleteThread={vi.fn()}
        onTogglePinThread={vi.fn()}
        labels={labels}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: labels.title });
    expect(dialog).toBeTruthy();
    expect(dialog.className).toContain("md:hidden");
    // Bottom sheet panel — not a left drawer.
    const panel = dialog.querySelector(".absolute.inset-x-0.bottom-0");
    expect(panel).toBeTruthy();
    expect(panel?.className).not.toMatch(/left-0/);
    expect(screen.getByText(/Taipei 101|Taipei/i)).toBeTruthy();
  });

  it("closes via scrim and close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MobileHistoryDrawer
        open
        threads={[]}
        activeId={null}
        onClose={onClose}
        onSelectThread={vi.fn()}
        onDeleteThread={vi.fn()}
        onTogglePinThread={vi.fn()}
        labels={labels}
      />,
    );

    const closeButtons = screen.getAllByRole("button", { name: labels.close });
    await user.click(closeButtons[0]!);
    expect(onClose).toHaveBeenCalled();

    onClose.mockClear();
    await user.click(closeButtons[closeButtons.length - 1]!);
    expect(onClose).toHaveBeenCalled();
  });

  it("selects a thread from the list", async () => {
    const user = userEvent.setup();
    const onSelectThread = vi.fn();
    render(
      <MobileHistoryDrawer
        open
        threads={[thread({ id: "t-select", address: "Unit 8B" })]}
        activeId={null}
        onClose={vi.fn()}
        onSelectThread={onSelectThread}
        onDeleteThread={vi.fn()}
        onTogglePinThread={vi.fn()}
        labels={labels}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Unit 8B/i }));
    expect(onSelectThread).toHaveBeenCalledWith("t-select");
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <MobileHistoryDrawer
        open={false}
        threads={[]}
        activeId={null}
        onClose={vi.fn()}
        onSelectThread={vi.fn()}
        onDeleteThread={vi.fn()}
        onTogglePinThread={vi.fn()}
        labels={labels}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
