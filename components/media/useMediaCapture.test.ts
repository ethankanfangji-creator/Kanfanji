import { describe, expect, it, vi } from "vitest";
import { selectSupportedAudioMimeType } from "./useMediaCapture";

describe("selectSupportedAudioMimeType", () => {
  it("prefers opus webm and falls back in browser-safe order", () => {
    const supported = vi.fn((type: string) => type === "audio/webm");
    expect(selectSupportedAudioMimeType(supported)).toBe("audio/webm");
    expect(supported.mock.calls.map(([type]) => type)).toEqual([
      "audio/webm;codecs=opus",
      "audio/webm",
    ]);
  });

  it("allows the MediaRecorder default when no candidate is supported", () => {
    expect(selectSupportedAudioMimeType(() => false)).toBe("");
  });
});
