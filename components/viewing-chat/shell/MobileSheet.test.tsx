// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileSheet } from "./MobileSheet";

afterEach(() => cleanup());

describe("MobileSheet", () => {
  it("exposes dialog semantics and closes from the scrim", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MobileSheet open onClose={onClose} title="Sheet title" closeLabel="Close" tall>
        <p>Body</p>
      </MobileSheet>,
    );

    const dialog = screen.getByRole("dialog", { name: "Sheet title" });
    expect(dialog.className).toContain("md:hidden");
    expect(dialog.querySelector(".bottom-0")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <MobileSheet open={false} onClose={vi.fn()} title="X" closeLabel="Close">
        hidden
      </MobileSheet>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
