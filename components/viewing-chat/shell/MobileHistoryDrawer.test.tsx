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
  compareToggle: "Compare",
  compareCancel: "Cancel",
  compareSelectedCount: "Selected {n}/3",
  compareOpen: "Compare ({n})",
  compareMaxReached: "Up to 3",
};

const compareProps = {
  compareMode: false,
  selectedIds: [] as string[],
  onToggleCompareMode: vi.fn(),
  onToggleSelect: vi.fn(),
  onOpenCompare: vi.fn(),
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
        {...compareProps}
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
        {...compareProps}
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
        {...compareProps}
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
        {...compareProps}
        labels={labels}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("checks rows in compare mode without opening the thread", async () => {
    const user = userEvent.setup();
    const onSelectThread = vi.fn();
    const onToggleSelect = vi.fn();
    render(
      <MobileHistoryDrawer
        open
        threads={[
          thread({ id: "a", address: "Alpha Road" }),
          thread({ id: "b", address: "Beta Road" }),
        ]}
        activeId={null}
        onClose={vi.fn()}
        onSelectThread={onSelectThread}
        onDeleteThread={vi.fn()}
        onTogglePinThread={vi.fn()}
        compareMode
        selectedIds={["a"]}
        onToggleCompareMode={vi.fn()}
        onToggleSelect={onToggleSelect}
        onOpenCompare={vi.fn()}
        labels={labels}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /Beta Road/i }));
    expect(onSelectThread).not.toHaveBeenCalled();
    expect(onToggleSelect).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("button", { name: "Pin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByRole("button", { name: "Compare (1)" })).toBeDisabled();
  });

  it("does not select a fourth row and shows the limit once", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onToggleSelect = vi.fn();
    render(
      <MobileHistoryDrawer
        open
        threads={["a", "b", "c", "d"].map((id) =>
          thread({ id, address: `Home ${id}` }),
        )}
        activeId={null}
        onClose={vi.fn()}
        onSelectThread={vi.fn()}
        onDeleteThread={vi.fn()}
        onTogglePinThread={vi.fn()}
        compareMode
        selectedIds={["a", "b", "c"]}
        onToggleCompareMode={vi.fn()}
        onToggleSelect={onToggleSelect}
        onOpenCompare={vi.fn()}
        labels={labels}
      />,
    );

    const fourth = screen.getByRole("checkbox", { name: /Home d/i });
    expect(fourth).toHaveAttribute("aria-disabled", "true");
    await user.click(fourth);
    expect(onToggleSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Up to 3");
  });
});
