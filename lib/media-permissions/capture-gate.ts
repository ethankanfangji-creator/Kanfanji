import {
  isBlockingPermissionStatus,
} from "./classify";
import type { CaptureKind, MediaPermissionStatus } from "./types";

export type ExplainedCaptureKind = "audio" | "video";

export type CaptureStartDecision =
  | { action: "open-picker" }
  | { action: "start-direct" }
  | { action: "show-preflight"; status: MediaPermissionStatus }
  | { action: "show-reauth"; status: MediaPermissionStatus };

/**
 * Decide whether to open the native picker, start capture directly, show a
 * one-shot explain sheet, or surface re-auth guidance.
 *
 * Photos and video never use an in-app permission dialog — they go straight to
 * the native file / camera picker so the browser/OS can ask for camera access.
 * Audio also starts directly (browser getUserMedia prompt); denied / revoked
 * audio shows re-auth guidance. The `explained` flag is kept for session
 * bookkeeping but no longer gates a custom sheet for audio/video.
 */
export function decideCaptureStart(input: {
  kind: CaptureKind;
  status: MediaPermissionStatus;
  explained: boolean;
}): CaptureStartDecision {
  if (input.kind === "photo" || input.kind === "video") {
    return { action: "open-picker" };
  }

  if (isBlockingPermissionStatus(input.status)) {
    return { action: "show-reauth", status: input.status };
  }

  return { action: "start-direct" };
}

const STORAGE_KEY = "kanfangji.captureExplained.v1";

type ExplainedMap = Record<ExplainedCaptureKind, boolean>;

function emptyExplained(): ExplainedMap {
  return { audio: false, video: false };
}

/** In-memory fallback when sessionStorage is unavailable (private mode / Node). */
let memoryExplained: ExplainedMap = emptyExplained();

function readStorage(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function readCaptureExplained(): ExplainedMap {
  const storage = readStorage();
  if (!storage) return { ...memoryExplained };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...memoryExplained };
    const parsed = JSON.parse(raw) as Partial<ExplainedMap>;
    return {
      audio: Boolean(parsed.audio) || memoryExplained.audio,
      video: Boolean(parsed.video) || memoryExplained.video,
    };
  } catch {
    return { ...memoryExplained };
  }
}

export function hasCaptureExplained(kind: ExplainedCaptureKind): boolean {
  return readCaptureExplained()[kind];
}

export function markCaptureExplained(kind: ExplainedCaptureKind): void {
  memoryExplained = { ...memoryExplained, [kind]: true };
  const storage = readStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(readCaptureExplained()));
  } catch {
    // Private mode / quota — memory flag still covers this navigation.
  }
}

/** Test helper — clears the session explained flags. */
export function resetCaptureExplainedForTests(): void {
  memoryExplained = emptyExplained();
  const storage = readStorage();
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
