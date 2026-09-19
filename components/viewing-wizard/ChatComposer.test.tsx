// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockMediaPermissionAdapter } from "@/lib/media-permissions";
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

  it("surfaces mic denied without calling getUserMedia directly", async () => {
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
});
