import { describe, expect, it, vi } from "vitest";
import {
  armMicStopCollector,
  blobFromChunks,
  stopMicRecorder,
  type MicRecorderLike,
} from "./mic-recording";

function fakeRecorder(): MicRecorderLike & {
  fireData: (data: Blob) => void;
  fireStop: () => void;
} {
  const rec: MicRecorderLike & {
    fireData: (data: Blob) => void;
    fireStop: () => void;
  } = {
    state: "recording",
    mimeType: "audio/webm",
    ondataavailable: null,
    onstop: null,
    start() {
      this.state = "recording";
    },
    stop() {
      this.state = "inactive";
    },
    fireData(data: Blob) {
      this.ondataavailable?.({ data });
    },
    fireStop() {
      this.onstop?.();
    },
  };
  return rec;
}

describe("blobFromChunks", () => {
  it("builds a non-empty blob from parts", () => {
    const blob = blobFromChunks([new Blob(["abc"])], "audio/webm");
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("audio/webm");
  });
});

describe("armMicStopCollector", () => {
  it("resolves with chunks already present when stop fires", async () => {
    const recorder = fakeRecorder();
    const chunks: BlobPart[] = [];
    const promise = armMicStopCollector(recorder, {
      chunks,
      mimeType: "audio/webm",
      emptyRetryMs: 5,
    });

    recorder.fireData(new Blob(["hello"]));
    recorder.fireStop();

    const blob = await promise;
    expect(blob.size).toBeGreaterThan(0);
  });

  it("retries when the final chunk arrives after onstop (Chrome-like)", async () => {
    const recorder = fakeRecorder();
    const chunks: BlobPart[] = [];
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const promise = armMicStopCollector(recorder, {
      chunks,
      mimeType: "audio/webm",
      emptyRetryMs: 10,
      emptyRetryAttempts: 3,
      schedule: (fn, ms) => {
        timers.push({ fn, ms });
      },
    });

    // onstop first with empty chunks (bad Chromium ordering)
    recorder.fireStop();
    expect(timers).toHaveLength(1);

    // final dataavailable arrives before the retry timer
    recorder.fireData(new Blob(["late-chunk"]));
    timers[0]!.fn();

    const blob = await promise;
    expect(blob.size).toBeGreaterThan(0);
  });

  it("resolves empty after retries if nothing was captured", async () => {
    vi.useFakeTimers();
    const recorder = fakeRecorder();
    const chunks: BlobPart[] = [];
    const promise = armMicStopCollector(recorder, {
      chunks,
      mimeType: "audio/webm",
      emptyRetryMs: 50,
      emptyRetryAttempts: 2,
    });

    recorder.fireStop();
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(50);
    const blob = await promise;
    expect(blob.size).toBe(0);
    vi.useRealTimers();
  });

  it("stopMicRecorder flushes with requestData before stop", () => {
    const requestData = vi.fn();
    const stop = vi.fn(function (this: MicRecorderLike) {
      this.state = "inactive";
    });
    const recorder: MicRecorderLike = {
      state: "recording",
      ondataavailable: null,
      onstop: null,
      start() {},
      stop,
      requestData,
    };
    stopMicRecorder(recorder);
    expect(requestData).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
