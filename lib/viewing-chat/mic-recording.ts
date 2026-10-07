/**
 * Helpers for MediaRecorder → Blob collection.
 * Chrome fires the final dataavailable and stop asynchronously after stop().
 */

export type MicRecorderLike = {
  state: string;
  mimeType?: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start: (timesliceMs?: number) => void;
  stop: () => void;
  requestData?: () => void;
};

/**
 * DOM MediaRecorder handlers use BlobEvent; under strictFunctionTypes that is
 * not assignable to our mock-friendly `{ data: Blob }` shape. Accept both and
 * normalize at the boundary.
 */
type MicRecorderInput = MediaRecorder | MicRecorderLike;

function asMicRecorderLike(recorder: MicRecorderInput): MicRecorderLike {
  return recorder as MicRecorderLike;
}

/** Build a blob from recorded chunks; empty if nothing was captured. */
export function blobFromChunks(chunks: BlobPart[], mimeType: string): Blob {
  return new Blob(chunks, { type: mimeType || "audio/webm" });
}

/** Wire timeslice collection onto a recorder (call before start). */
export function attachMicDataCollector(
  recorder: MicRecorderInput,
  chunks: BlobPart[],
): void {
  asMicRecorderLike(recorder).ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };
}

/**
 * Resolve with the final Blob when recording stops.
 * Call `recorder.stop()` yourself after arming — prefer `stopMicRecorder`
 * so Chromium gets a `requestData()` flush first.
 *
 * Retries briefly if the first pass is empty — Chromium may deliver the final
 * dataavailable in a macrotask around onstop.
 */
export function armMicStopCollector(
  recorder: MicRecorderInput,
  options: {
    chunks: BlobPart[];
    mimeType: string;
    emptyRetryMs?: number;
    emptyRetryAttempts?: number;
    schedule?: (fn: () => void, ms: number) => void;
  },
): Promise<Blob> {
  const schedule =
    options.schedule ??
    ((fn, ms) => {
      globalThis.setTimeout(fn, ms);
    });
  const emptyRetryMs = options.emptyRetryMs ?? 80;
  const emptyRetryAttempts = options.emptyRetryAttempts ?? 4;
  const mic = asMicRecorderLike(recorder);

  return new Promise<Blob>((resolve) => {
    let settled = false;
    const settle = (blob: Blob) => {
      if (settled) return;
      settled = true;
      resolve(blob);
    };

    // Keep collecting (including the final chunk emitted on stop).
    attachMicDataCollector(mic, options.chunks);

    mic.onstop = () => {
      const trySettle = (attempt: number) => {
        const blob = blobFromChunks(options.chunks, options.mimeType);
        if (blob.size > 0 || attempt >= emptyRetryAttempts) {
          settle(blob);
          return;
        }
        schedule(() => trySettle(attempt + 1), emptyRetryMs);
      };
      trySettle(0);
    };
  });
}

/** Flush pending timeslice data then stop. Safe if requestData is missing. */
export function stopMicRecorder(recorder: MicRecorderInput): void {
  const mic = asMicRecorderLike(recorder);
  try {
    if (mic.state === "recording" && typeof mic.requestData === "function") {
      mic.requestData();
    }
  } catch {
    // Some engines throw if requestData races with stop — ignore.
  }
  mic.stop();
}
