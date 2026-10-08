// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
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
  voiceToText: "Voice to text",
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
  processing: "Transcribing…",
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
      // Simulate timeslice chunk while recording.
      Promise.resolve().then(() => {
        if (this.state !== "recording") return;
        this.ondataavailable?.({
          data: new Blob(["chunk"], { type: "audio/webm" }),
        });
      });
    }
    requestData() {
      this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
    }
    stop() {
      this.state = "inactive";
      // Chrome-like: final dataavailable then stop, both async.
      void Promise.resolve().then(() => {
        this.ondataavailable?.({
          data: new Blob(["final"], { type: "audio/webm" }),
        });
        this.onstop?.();
      });
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
  it("asks the browser for the microphone on the first tap", async () => {
    const user = userEvent.setup();
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "prompt" },
    });
    const requestSpy = vi.spyOn(adapter, "request");
    renderComposer(adapter);

    await user.click(screen.getByRole("button", { name: labels.recording }));

    expect(screen.queryByText(permissionCopy.titleMic)).toBeNull();
    expect(screen.queryByText(permissionCopy.bodyMic)).toBeNull();
    await waitFor(() => expect(requestSpy).toHaveBeenCalled());
  });

  it("keeps typed notes when the browser denies the microphone", async () => {
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

    expect(screen.queryByText(permissionCopy.titleMic)).toBeNull();
    expect(
      await screen.findByRole("button", { name: permissionCopy.importInstead }),
    ).toBeTruthy();
    expect(textarea.value).toBe("keep this note");
  });

  it("does not open our microphone dialog when permission was already denied", async () => {
    const user = userEvent.setup();
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "denied" },
    });
    const requestSpy = vi.spyOn(adapter, "request");
    renderComposer(adapter);

    await user.click(screen.getByRole("button", { name: labels.recording }));

    expect(screen.queryByText(permissionCopy.titleMic)).toBeNull();
    expect(
      await screen.findByRole("button", { name: permissionCopy.importInstead }),
    ).toBeTruthy();
    await waitFor(() => expect(requestSpy).toHaveBeenCalled());
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

  it("opens the photo picker from a two-item attach menu", async () => {
    const user = userEvent.setup();
    renderComposer();

    const gallery = screen.getByTestId("photo-gallery-input") as HTMLInputElement;
    const clickSpy = vi.spyOn(gallery, "click");

    await user.click(screen.getByRole("button", { name: labels.attach }));
    expect(screen.getByRole("menuitem", { name: labels.uploadImage })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: labels.uploadFile })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: labels.uploadVideo })).toBeNull();

    await user.click(screen.getByRole("menuitem", { name: labels.uploadImage }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
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

  it("auto-submits microphone audio when recording stops", async () => {
    const user = userEvent.setup();
    markCaptureExplained("audio");
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "granted" },
    });
    const onSubmit = vi.fn();
    renderComposer(adapter, onSubmit);

    const textarea = screen.getByLabelText(
      labels.placeholder,
    ) as HTMLTextAreaElement;
    await user.type(textarea, "caption");
    await user.click(screen.getByRole("button", { name: labels.recording }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: labels.stop })).toBeTruthy(),
    );
    await user.click(screen.getByRole("button", { name: labels.stop }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]?.[0] as {
      text: string;
      audio: Blob | null;
    };
    expect(payload.text).toBe("caption");
    expect(payload.audio).toBeInstanceOf(Blob);
    expect(payload.audio?.size).toBeGreaterThan(0);
    expect(textarea.value).toBe("");
  });

  it("still auto-submits under React Strict Mode effect remount", async () => {
    const user = userEvent.setup();
    markCaptureExplained("audio");
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "granted" },
    });
    const onSubmit = vi.fn();
    render(
      <StrictMode>
        <ViewingChatComposer
          labels={labels}
          permissionCopy={permissionCopy}
          mediaAdapter={adapter}
          onSubmit={onSubmit}
        />
      </StrictMode>,
    );

    await user.click(screen.getByRole("button", { name: labels.recording }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: labels.stop })).toBeTruthy(),
    );
    await user.click(screen.getByRole("button", { name: labels.stop }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]?.[0] as { audio: Blob | null };
    expect(payload.audio?.size).toBeGreaterThan(0);
  });

  it("stages imported audio for manual send instead of auto-submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderComposer(undefined, onSubmit);

    const input = screen.getByTestId("audio-import-input") as HTMLInputElement;
    const clip = new File([new Uint8Array(32)], "note.webm", {
      type: "audio/webm",
    });
    fireEvent.change(input, { target: { files: [clip] } });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "remove audio" })).toBeTruthy(),
    );
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: labels.send }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]?.[0] as { audio: Blob | null };
    expect(payload.audio).toBeInstanceOf(Blob);
  });
});
