// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaPermissionBanner } from "./MediaPermissionBanner";

afterEach(cleanup);

describe("MediaPermissionBanner", () => {
  it("offers settings guidance plus import and text-note fallbacks when denied", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const onTextNote = vi.fn();

    render(
      <MediaPermissionBanner
        status="denied"
        message="Microphone denied"
        settingsHint="Open browser settings"
        importLabel="Import file"
        onImport={onImport}
        textNoteLabel="Write a note instead"
        onTextNote={onTextNote}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Microphone denied");
    expect(screen.getByText("Open browser settings")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Import file" }));
    await user.click(screen.getByRole("button", { name: "Write a note instead" }));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onTextNote).toHaveBeenCalledTimes(1);
  });
});
