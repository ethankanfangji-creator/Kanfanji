// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionCopy } from "@/components/media/PermissionPreflight";
import {
  createMockMediaPermissionAdapter,
  resetCaptureExplainedForTests,
} from "@/lib/media-permissions";
import { ChatComposer, type ChatComposerMessages } from "./ChatComposer";

const copy: ChatComposerMessages = {
  placeholder: "Type",
  placeholderBound: "Bound",
  send: "Send",
  cancel: "Cancel",
  recording: "Recording",
  stopRecording: "Stop",
  attachImage: "Attach",
  removeImage: "Remove image",
  removeAudio: "Remove audio",
  clearBound: "Clear bind",
  suggestionsLabel: "Tickets",
  limitsHint: "limits",
  imageTooLarge: "too large",
  imageBadType: "bad type",
  audioTooLarge: "audio large",
  emptyError: "empty",
  micDenied: "mic denied",
  micUnsupported: "mic unsupported",
  uploading: "uploading",
  integrating: "integrating",
  transcribing: "transcribing",
  reEdit: "reedit",
  sourceUser: "user",
  sourceAi: "ai",
  discoveryBadge: "discovery",
};

const permissionCopy: PermissionCopy = {
  titleMic: "Microphone access needed",
  titleCamera: "Camera access",
  titlePhoto: "Photo access",
  bodyMic: "Why mic: notes become transcripts. Browser will ask next.",
  bodyCamera: "Why camera.",
  bodyPhoto: "Why photo.",
  localNote: "Saved locally first.",
  continue: "Continue & allow",
  cancel: "Not now",
  importInstead: "Import instead",
  textNoteInstead: "Write a text note instead",
  settingsHint: "Use settings or import.",
  status: {
    granted: "Allowed",
    prompt: "Not decided yet",
    denied: "Permission denied",
    blocked: "Blocked",
    unsupported: "Unsupported",
    "in-use": "In use",
    "permission-revoked": "Revoked",
  },
};

beforeEach(() => {
  resetCaptureExplainedForTests();
});

afterEach(() => {
  cleanup();
});

describe("ChatComposer media adapter", () => {
  it("binds a suggestion ticket before submit", async () => {
    const user = userEvent.setup();
    const onBind = vi.fn();
    const onSubmit = vi.fn();
    render(
      <ChatComposer
        messages={copy}
        suggestions={[{ id: 7, text: "Check windows" }]}
        boundQuestionId={null}
        boundQuestionText={null}
        mediaAdapter={createMockMediaPermissionAdapter({
          statuses: { microphone: "granted" },
        })}
        onBindQuestion={onBind}
        onClearBound={vi.fn()}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Check windows/i }));
    expect(onBind).toHaveBeenCalledWith(7);
  });

  it("surfaces mic denied without calling getUserMedia directly when no permissionCopy", async () => {
    const user = userEvent.setup();
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "denied" },
    });
    const requestSpy = vi.spyOn(adapter, "request");
    render(
      <ChatComposer
        messages={copy}
        suggestions={[]}
        boundQuestionId={null}
        boundQuestionText={null}
        mediaAdapter={adapter}
        onBindQuestion={vi.fn()}
        onClearBound={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: copy.recording }));
    expect(requestSpy).toHaveBeenCalled();
    expect(await screen.findByText(copy.micDenied)).toBeTruthy();
  });

  it("explains why mic is needed before requesting getUserMedia", async () => {
    const user = userEvent.setup();
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "prompt" },
    });
    const requestSpy = vi.spyOn(adapter, "request");
    render(
      <ChatComposer
        messages={copy}
        permissionCopy={permissionCopy}
        suggestions={[]}
        boundQuestionId={null}
        boundQuestionText={null}
        mediaAdapter={adapter}
        onBindQuestion={vi.fn()}
        onClearBound={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: copy.recording }));
    expect(requestSpy).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("dialog", { name: permissionCopy.titleMic }),
    ).toBeTruthy();
    expect(screen.getByText(permissionCopy.bodyMic)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: permissionCopy.continue }));
    expect(requestSpy).toHaveBeenCalled();
  });

  it("keeps text-note fallback when mic permission is denied", async () => {
    const user = userEvent.setup();
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "denied" },
    });
    const requestSpy = vi.spyOn(adapter, "request");
    render(
      <ChatComposer
        messages={copy}
        permissionCopy={permissionCopy}
        suggestions={[]}
        boundQuestionId={null}
        boundQuestionText={null}
        mediaAdapter={adapter}
        onBindQuestion={vi.fn()}
        onClearBound={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: copy.recording }));
    expect(requestSpy).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("dialog", { name: permissionCopy.titleMic }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: permissionCopy.textNoteInstead })).toBeTruthy();
    expect(screen.queryByRole("button", { name: permissionCopy.continue })).toBeNull();
  });
});
