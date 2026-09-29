// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareReportDialog } from "./ShareReportDialog";

const labels = {
  title: "Share",
  body: "Body",
  point1: "1",
  point2: "2",
  point3: "3",
  acknowledge: "I understand",
  create: "Create",
  revoke: "Revoke",
  regenerate: "Regenerate",
  regenerateConfirm: "Replace the link?",
  copy: "Copy",
  copyFailed: "Copy failed",
  unavailable: "Unavailable",
  needsRegenerate: "Regenerate",
  close: "Close",
};

afterEach(() => cleanup());

describe("ShareReportDialog", () => {
  it("does not create until the notice is checked", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <ShareReportDialog
        open
        url={null}
        needsRegenerate={false}
        error={null}
        labels={labels}
        onClose={vi.fn()}
        onCreate={onCreate}
        onCopy={async () => true}
        onRevoke={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
    const create = screen.getByRole("button", { name: "Create" });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("checkbox"));
    await user.click(create);
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("asks before regenerating and keeps the url when revoke fails", async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn();
    const onRevoke = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ShareReportDialog
        open
        url="https://example.com/s/abc"
        needsRegenerate={false}
        error="Unavailable"
        labels={labels}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onCopy={async () => true}
        onRevoke={onRevoke}
        onRegenerate={onRegenerate}
      />,
    );
    expect(screen.getByText("https://example.com/s/abc")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(onRegenerate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(onRevoke).toHaveBeenCalledOnce();
    expect(screen.getByText("https://example.com/s/abc")).toBeTruthy();
  });
});
