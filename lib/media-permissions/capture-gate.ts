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
 * Photos never use an in-app permission dialog — they go straight to the
 * native file picker. Video uses `<input capture>` (no getUserMedia), so after
 * a one-shot explain it always opens the picker. Audio shows a short explain
 * only while status is still `prompt` and the session has not explained yet;
 * after grant (or once explained), later taps start the recorder without the
 * custom sheet. Denied / revoked audio shows re-auth guidance.
 */
export function decideCaptureStart(input: {
  kind: CaptureKind;
  status: MediaPermissionStatus;
  explained: boolean;
}): CaptureStartDecision {
  if (input.kind === "photo") {
    return { action: "open-picker" };
  }

  if (input.kind === "video") {
    if (!input.explained) {
      return {
        action: "show-preflight",
        status: input.status === "granted" ? "prompt" : input.status,
      };
    }
    return { action: "start-direct" };
  }

  if (isBlockingPermissionStatus(input.status)) {
    return { action: "show-reauth", status: input.status };
  }

  if (input.status === "granted") {
    return { action: "start-direct" };
  }

  if (!input.explained) {
    return { action: "show-preflight", status: input.status };
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
