// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickActionChip } from "./QuickActionChip";

afterEach(() => cleanup());

describe("QuickActionChip", () => {
  it("runs the click and stays an outline chip", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<QuickActionChip onClick={onClick}>Skip</QuickActionChip>);
    const button = screen.getByRole("button", { name: "Skip" });
    expect(button.className).toMatch(/bg-white/);
    expect(button.className).not.toMatch(/bg-\[#DBEAFE\]/);
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <QuickActionChip disabled onClick={onClick}>
        Skip
      </QuickActionChip>,
    );
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
