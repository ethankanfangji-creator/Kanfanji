// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaimLimitDialog } from "./ClaimLimitDialog";

afterEach(() => cleanup());

describe("ClaimLimitDialog", () => {
  it("offers upgrade, manage, and later", () => {
    const onUpgrade = vi.fn();
    const onManage = vi.fn();
    const onLater = vi.fn();
    render(
      <ClaimLimitDialog
        title="Full"
        body="Delete or upgrade."
        upgradeLabel="Upgrade"
        manageLabel="Manage"
        laterLabel="Later"
        onUpgrade={onUpgrade}
        onManage={onManage}
        onLater={onLater}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Upgrade" }));
    expect(onUpgrade).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(onManage).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(onLater).toHaveBeenCalledOnce();
  });
});
