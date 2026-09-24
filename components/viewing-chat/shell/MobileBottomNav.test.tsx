// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileBottomNav } from "./MobileBottomNav";

const shortLabels = {
  nav: "Primary navigation",
  new: "New",
  history: "History",
  search: "Search",
  media: "Media",
  account: "Account",
};

afterEach(() => cleanup());

describe("MobileBottomNav", () => {
  it("renders short icon labels and reports selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <MobileBottomNav
        activeTab="new"
        onSelect={onSelect}
        labels={shortLabels}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "History" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Media" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Account" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "History" }));
    expect(onSelect).toHaveBeenCalledWith("history");
  });

  it("marks the selected tab for sighted and assistive users", () => {
    render(
      <MobileBottomNav
        activeTab="search"
        onSelect={() => undefined}
        labels={shortLabels}
      />,
    );

    const search = screen.getByRole("button", { name: "Search" });
    expect(search).toHaveAttribute("aria-current", "page");
    expect(search).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("button", { name: "New" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("hides entirely while the keyboard is open", () => {
    const { container } = render(
      <MobileBottomNav
        hidden
        activeTab={null}
        onSelect={() => undefined}
        labels={shortLabels}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("hides when callers OR chat-focus into the hidden flag", () => {
    const keyboardOpen = false;
    const chatFocusMode = true;
    const { container } = render(
      <MobileBottomNav
        hidden={keyboardOpen || chatFocusMode}
        activeTab={null}
        onSelect={() => undefined}
        labels={{
          nav: "Primary navigation",
          new: "New",
          history: "History",
          search: "Search",
          media: "Media",
          account: "Account",
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps New selected but inert on address setup with an aria reason", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <MobileBottomNav
        activeTab="new"
        onSelect={onSelect}
        disabledTabs={{ new: "Already starting a new viewing" }}
        labels={{
          nav: "Primary navigation",
          new: "New property",
          history: "Viewing history",
          search: "Search records",
          media: "Media library",
          account: "Account",
        }}
      />,
    );

    const newTab = screen.getByRole("button", {
      name: "Already starting a new viewing",
    });
    expect(newTab).toBeDisabled();
    expect(newTab).toHaveAttribute("aria-current", "page");
    await user.click(newTab);
    expect(onSelect).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Viewing history" }));
    expect(onSelect).toHaveBeenCalledWith("history");
  });
});
