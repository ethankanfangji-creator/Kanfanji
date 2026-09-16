import type {
  MediaPermissionAdapter,
  MediaPermissionName,
  MediaPermissionRequestResult,
  MediaPermissionStatus,
} from "./types";

export type MockMediaPermissionState = {
  supported?: boolean;
  recorderSupported?: boolean;
  statuses?: Partial<Record<MediaPermissionName, MediaPermissionStatus>>;
  /** Forced result for the next request() call(s). */
  requestResult?: MediaPermissionRequestResult | (() => MediaPermissionRequestResult);
};

function fakeStream(): MediaStream {
  // Minimal MediaStream-like object for unit tests (no real tracks required).
  const tracks: MediaStreamTrack[] = [];
  return {
    id: "mock-stream",
    active: true,
    getTracks: () => tracks,
    getAudioTracks: () => tracks,
    getVideoTracks: () => tracks,
    addTrack: () => undefined,
    removeTrack: () => undefined,
    clone: () => fakeStream(),
    getTrackById: () => null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
    onaddtrack: null,
    onremovetrack: null,
  } as unknown as MediaStream;
}

/**
 * Deterministic adapter for unit tests — never touches real hardware.
 */
export function createMockMediaPermissionAdapter(
  initial: MockMediaPermissionState = {},
): MediaPermissionAdapter & {
  setStatus: (name: MediaPermissionName, status: MediaPermissionStatus) => void;
  setRequestResult: (
    result: MediaPermissionRequestResult | (() => MediaPermissionRequestResult),
  ) => void;
  requestCount: () => number;
} {
  const supported = initial.supported ?? true;
  const recorderSupported = initial.recorderSupported ?? true;
  const statuses: Record<MediaPermissionName, MediaPermissionStatus> = {
    microphone: initial.statuses?.microphone ?? "prompt",
    camera: initial.statuses?.camera ?? "prompt",
  };
  let requestResult = initial.requestResult;
  let requests = 0;

  return {
    isMediaDevicesSupported() {
      return supported;
    },
    isMediaRecorderSupported() {
      return recorderSupported;
    },
    async query(name) {
      if (!supported) return "unsupported";
      return statuses[name];
    },
    async request(name) {
      requests += 1;
      if (!supported) {
        return {
          ok: false,
          status: "unsupported",
          error: new Error("unsupported"),
        };
      }
      if (name === "microphone" && !recorderSupported) {
        return {
          ok: false,
          status: "unsupported",
          error: new Error("MediaRecorder unsupported"),
        };
      }
      if (typeof requestResult === "function") {
        return requestResult();
      }
      if (requestResult) return requestResult;

      const status = statuses[name];
      if (status === "granted" || status === "prompt") {
        statuses[name] = "granted";
        return { ok: true, stream: fakeStream(), status: "granted" };
      }
      return {
        ok: false,
        status,
        error: new Error(`mock:${status}`),
      };
    },
    release(stream) {
      stream?.getTracks().forEach((t) => t.stop());
    },
    setStatus(name, status) {
      statuses[name] = status;
    },
    setRequestResult(result) {
      requestResult = result;
    },
    requestCount() {
      return requests;
    },
  };
}
