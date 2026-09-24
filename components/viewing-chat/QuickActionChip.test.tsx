// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionQuickActions } from "./CollectionQuickActions";
import { ReportQuickActions } from "./ReportQuickActions";

afterEach(() => cleanup());

describe("quick-action chips", () => {
  it("keeps report action clicks and uses outline chips (not filled blue)", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const { container } = render(
      <ReportQuickActions
        actions={[
          { id: "supplement", label: "Add info" },
          { id: "finish", label: "Finish" },
        ]}
        onAction={onAction}
      />,
    );

    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toMatch(/overflow-x-auto/);
    expect(row.className).not.toMatch(/flex-wrap/);

    const finish = screen.getByRole("button", { name: "Finish" });
    expect(finish.className).toMatch(/bg-white/);
    expect(finish.className).not.toMatch(/bg-\[#DBEAFE\]/);

    await user.click(finish);
    expect(onAction).toHaveBeenCalledWith("finish");
  });

  it("keeps collection action clicks on the shared chip", async () => {
    const user = userEvent.setup();
    const onPasteUrl = vi.fn();
    render(
      <CollectionQuickActions
        labels={{
          pasteUrl: "Paste URL",
          uploadPhoto: "Photos",
          uploadScreenshot: "Screenshot",
          uploadHoaDoc: "HOA",
          pasteText: "Paste text",
          skip: "Skip",
        }}
        onPasteUrl={onPasteUrl}
        onUploadPhoto={vi.fn()}
        onUploadScreenshot={vi.fn()}
        onUploadHoaDoc={vi.fn()}
        onPasteText={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Paste URL" }));
    expect(onPasteUrl).toHaveBeenCalled();
  });
});
