// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PermissionPreflight, type PermissionCopy } from "./PermissionPreflight";

const copy: PermissionCopy = {
  titleMic: "Microphone access",
  titleCamera: "Camera access",
  titlePhoto: "Photo access",
  bodyMic: "Record notes.",
  bodyCamera: "Record video.",
  bodyPhoto: "Take photos.",
  localNote: "Saved locally first.",
  continue: "Continue",
  cancel: "Not now",
  importInstead: "Import instead",
  settingsHint: "Use settings or import.",
  status: {
    granted: "Allowed",
    prompt: "Prompt",
    denied: "Denied",
    blocked: "Blocked",
    unsupported: "Unsupported",
    "in-use": "In use",
    "permission-revoked": "Revoked",
  },
};

describe("PermissionPreflight", () => {
  it("keeps a named gallery alternative when camera access is blocked", () => {
    render(
      <PermissionPreflight
        kind="video"
        copy={copy}
        status="blocked"
        onContinue={vi.fn()}
        onCancel={vi.fn()}
        onImport={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Camera access" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import instead" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not now" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });
});
