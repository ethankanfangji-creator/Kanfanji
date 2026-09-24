// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SheetCloseButton } from "./SheetCloseButton";

afterEach(() => cleanup());

describe("SheetCloseButton", () => {
  it("uses a consistent 44px hit target and fires onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<SheetCloseButton label="Close" onClick={onClick} />);

    const btn = screen.getByRole("button", { name: "Close" });
    expect(btn.className).toMatch(/h-11/);
    expect(btn.className).toMatch(/w-11/);
    await user.click(btn);
    expect(onClick).toHaveBeenCalled();
  });
});
