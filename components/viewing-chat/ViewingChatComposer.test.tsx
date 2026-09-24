// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockMediaPermissionAdapter,
  markCaptureExplained,
  resetCaptureExplainedForTests,
} from "@/lib/media-permissions";
import { AI_LIMITS } from "@/lib/ai-boundary/config";
import {
  ViewingChatComposer,
  type ChatComposerLabels,
} from "./ViewingChatComposer";
import type { PermissionCopy } from "@/components/media/PermissionPreflight";

const permissionCopy: PermissionCopy = {
  titleMic: "Microphone access needed",
  titleCamera: "Camera access needed",
  titlePhoto: "Photo access needed",
  bodyMic: "Used for voice notes.",
  bodyCamera: "Used for clips.",
  bodyPhoto: "Used for photos.",
  localNote: "Files stay on this device first.",
  continue: "Continue & allow",
  cancel: "Not now",
  importInstead: "Import a file instead",
  textNoteInstead: "Write a text note instead",
  settingsHint: "Enable mic/camera in settings or import a file.",
  status: {
    granted: "Allowed",
    prompt: "Not decided yet",
    denied: "Permission denied",
    blocked: "Blocked — enable in settings",
    unsupported: "Not supported",
    "in-use": "Device in use",
    "permission-revoked": "Permission revoked",
  },
};

const labels: ChatComposerLabels = {
  placeholder: "Notes…",
  send: "Send",
  recording: "Recording",
  stop: "Stop",
  attach: "Attach",
  camera: "Camera",
  uploadImage: "Upload image",
  uploadFile: "Upload file",
  uploadVideo: "Upload video",
  empty: "Add something first",
  micDenied: "Microphone unavailable",
  importAudio: "Import audio",
  audioTooLarge: "Audio too large",
  imageTooLarge: "Image too large",
  emptyFile: "Empty file",
  videoTooLarge: "Video too large",
};

afterEach(() => {
  cleanup();
  resetCaptureExplainedForTests();
});

beforeEach(() => {
  resetCaptureExplainedForTests();
  class FakeMediaRecorder {
    state = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
      this.onstop?.();
    }
    static isTypeSupported() {
      return true;
    }
  }
  // @ts-expect-error test stub
  globalThis.MediaRecorder = FakeMediaRecorder;
});

function renderComposer(
  adapter = createMockMediaPermissionAdapter({
    statuses: { microphone: "prompt", camera: "prompt" },
  }),
  onSubmit = vi.fn(),
) {
  return {
    adapter,
    onSubmit,
    ...render(
      <ViewingChatComposer
        labels={labels}
        permissionCopy={permissionCopy}
        mediaAdapter={adapter}
        onSubmit={onSubmit}
      />,
    ),
  };
}

describe("ViewingChatComposer permission onboarding", () => {
  it("shows mic preflight before getUserMedia on first tap", async () => {
    const user = userEvent.setup();
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "prompt" },
    });
    const requestSpy = vi.spyOn(adapter, "request");
    renderComposer(adapter);

    await user.click(screen.getByRole("button", { name: labels.recording }));

    expect(await screen.findByText(permissionCopy.titleMic)).toBeTruthy();
    expect(screen.getByText(permissionCopy.bodyMic)).toBeTruthy();
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it("requests mic after Continue and keeps typed notes on deny", async () => {
    const user = userEvent.setup();
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "prompt" },
      requestResult: {
        ok: false,
        status: "denied",
        error: new Error("denied"),
      },
    });
    renderComposer(adapter);

    const textarea = screen.getByLabelText(
      labels.placeholder,
    ) as HTMLTextAreaElement;
    await user.type(textarea, "keep this note");
    await user.click(screen.getByRole("button", { name: labels.recording }));
    await user.click(
      await screen.findByRole("button", { name: permissionCopy.continue }),
    );

    expect(await screen.findByText(permissionCopy.status.denied)).toBeTruthy();
    expect(screen.getByText(permissionCopy.importInstead)).toBeTruthy();
    expect(textarea.value).toBe("keep this note");
  });

  it("offers audio import when mic is already denied", async () => {
    const user = userEvent.setup();
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "denied" },
    });
    const requestSpy = vi.spyOn(adapter, "request");
    renderComposer(adapter);

    await user.click(screen.getByRole("button", { name: labels.recording }));

    expect(await screen.findByText(permissionCopy.status.denied)).toBeTruthy();
    expect(requestSpy).not.toHaveBeenCalled();

    const importInput = screen.getByTestId(
      "audio-import-input",
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(importInput, "click");
    await user.click(
      screen.getByRole("button", { name: permissionCopy.importInstead }),
    );
    expect(clickSpy).toHaveBeenCalled();
  });

  it("starts recording directly after explained when mic is granted", async () => {
    const user = userEvent.setup();
    markCaptureExplained("audio");
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "granted" },
    });
    const requestSpy = vi.spyOn(adapter, "request");
    renderComposer(adapter);

    await user.click(screen.getByRole("button", { name: labels.recording }));

    expect(screen.queryByText(permissionCopy.titleMic)).toBeNull();
    await waitFor(() => expect(requestSpy).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: labels.stop })).toBeTruthy();
  });

  it("shows camera preflight then opens gallery import on deny", async () => {
    const user = userEvent.setup();
    const adapter = createMockMediaPermissionAdapter({
      statuses: { camera: "prompt" },
    });
    renderComposer(adapter);

    await user.click(screen.getByRole("button", { name: labels.attach }));
    await user.click(screen.getByRole("menuitem", { name: labels.camera }));

    expect(await screen.findByText(permissionCopy.titleCamera)).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: permissionCopy.cancel }),
    );

    adapter.setStatus("camera", "blocked");
    await user.click(screen.getByRole("button", { name: labels.attach }));
    await user.click(screen.getByRole("menuitem", { name: labels.camera }));

    expect(await screen.findByText(permissionCopy.status.blocked)).toBeTruthy();
    const gallery = screen.getByTestId(
      "photo-gallery-input",
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(gallery, "click");
    await user.click(
      screen.getByRole("button", { name: permissionCopy.importInstead }),
    );
    expect(clickSpy).toHaveBeenCalled();
  });

  it("rejects oversized audio imports without clearing text", async () => {
    const user = userEvent.setup();
    renderComposer();

    const textarea = screen.getByLabelText(
      labels.placeholder,
    ) as HTMLTextAreaElement;
    await user.type(textarea, "still here");

    const input = screen.getByTestId("audio-import-input") as HTMLInputElement;
    const big = new File(
      [new Uint8Array(AI_LIMITS.audioBytes + 1)],
      "big.webm",
      { type: "audio/webm" },
    );
    fireEvent.change(input, { target: { files: [big] } });

    expect(await screen.findByText(labels.audioTooLarge)).toBeTruthy();
    expect(textarea.value).toBe("still here");
  });
});
