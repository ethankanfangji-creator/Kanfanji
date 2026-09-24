// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileBottomNav } from "./MobileBottomNav";

afterEach(() => cleanup());

describe("MobileBottomNav", () => {
  it("renders readable tab labels and reports selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <MobileBottomNav
        activeTab="new"
        onSelect={onSelect}
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

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New property" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Viewing history" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search records" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Media library" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Account" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Viewing history" }));
    expect(onSelect).toHaveBeenCalledWith("history");
  });

  it("hides entirely while the keyboard is open", () => {
    const { container } = render(
      <MobileBottomNav
        hidden
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
});
