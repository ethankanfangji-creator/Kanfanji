import { describe, expect, it, beforeEach } from "vitest";
import {
  decideCaptureStart,
  hasCaptureExplained,
  markCaptureExplained,
  resetCaptureExplainedForTests,
} from "./capture-gate";

describe("decideCaptureStart", () => {
  it("routes photos straight to the native file picker", () => {
    expect(
      decideCaptureStart({ kind: "photo", status: "prompt", explained: false }),
    ).toEqual({ action: "open-picker" });
    expect(
      decideCaptureStart({ kind: "photo", status: "denied", explained: true }),
    ).toEqual({ action: "open-picker" });
  });

  it("starts audio directly when already granted", () => {
    expect(
      decideCaptureStart({ kind: "audio", status: "granted", explained: false }),
    ).toEqual({ action: "start-direct" });
  });

  it("opens the native picker for video without an in-app permission sheet", () => {
    expect(
      decideCaptureStart({ kind: "video", status: "prompt", explained: false }),
    ).toEqual({ action: "open-picker" });
    expect(
      decideCaptureStart({ kind: "video", status: "denied", explained: true }),
    ).toEqual({ action: "open-picker" });
    expect(
      decideCaptureStart({ kind: "video", status: "granted", explained: false }),
    ).toEqual({ action: "open-picker" });
  });

  it("starts audio directly so the browser can ask for the microphone", () => {
    expect(
      decideCaptureStart({ kind: "audio", status: "prompt", explained: false }),
    ).toEqual({ action: "start-direct" });
    expect(
      decideCaptureStart({ kind: "audio", status: "prompt", explained: true }),
    ).toEqual({ action: "start-direct" });
  });

  it("surfaces re-auth for denied / blocked / revoked / unsupported / in-use audio", () => {
    for (const status of [
      "denied",
      "blocked",
      "permission-revoked",
      "unsupported",
      "in-use",
    ] as const) {
      expect(
        decideCaptureStart({ kind: "audio", status, explained: true }),
      ).toEqual({ action: "show-reauth", status });
    }
  });
});

describe("capture explained session flags", () => {
  beforeEach(() => {
    resetCaptureExplainedForTests();
  });

  it("persists explained flags in sessionStorage", () => {
    expect(hasCaptureExplained("audio")).toBe(false);
    markCaptureExplained("audio");
    expect(hasCaptureExplained("audio")).toBe(true);
    expect(hasCaptureExplained("video")).toBe(false);
  });
});
