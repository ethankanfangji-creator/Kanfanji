import { classifyMediaError, mapPermissionState } from "./classify";
import type {
  MediaPermissionAdapter,
  MediaPermissionName,
  MediaPermissionRequestResult,
  MediaPermissionStatus,
} from "./types";

function defaultConstraints(name: MediaPermissionName): MediaStreamConstraints {
  return name === "microphone" ? { audio: true, video: false } : { audio: false, video: true };
}

export function createBrowserMediaPermissionAdapter(): MediaPermissionAdapter {
  return {
    isMediaDevicesSupported() {
      return (
        typeof navigator !== "undefined" &&
        !!navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function"
      );
    },

    isMediaRecorderSupported() {
      return typeof MediaRecorder !== "undefined";
    },

    async query(name: MediaPermissionName): Promise<MediaPermissionStatus> {
      if (!this.isMediaDevicesSupported()) return "unsupported";
      if (name === "microphone" && !this.isMediaRecorderSupported()) {
        // Still allow import fallback; query mic may work without MediaRecorder.
      }

      const permissionName = name === "microphone" ? "microphone" : "camera";
      try {
        if (!navigator.permissions?.query) return "prompt";
        // Some browsers throw or reject for microphone/camera.
        const result = await navigator.permissions.query({
          name: permissionName as PermissionName,
        });
        return mapPermissionState(result.state);
      } catch {
        // Safari / Firefox quirks → treat as prompt until user gesture.
        return "prompt";
      }
    },

    async request(
      name: MediaPermissionName,
      constraints?: MediaStreamConstraints,
    ): Promise<MediaPermissionRequestResult> {
      if (!this.isMediaDevicesSupported()) {
        return {
          ok: false,
          status: "unsupported",
          error: new Error("此瀏覽器不支援媒體裝置"),
        };
      }
      if (name === "microphone" && !this.isMediaRecorderSupported()) {
        return {
          ok: false,
          status: "unsupported",
          error: new Error("此瀏覽器不支援錄音（MediaRecorder）"),
        };
      }

      const prior = await this.query(name);
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          constraints ?? defaultConstraints(name),
        );
        return { ok: true, stream, status: "granted" };
      } catch (error) {
        const classified = classifyMediaError(error, { name, prior });
        return {
          ok: false,
          status: classified.status,
          error: error instanceof Error ? error : new Error(classified.message),
        };
      }
    },

    release(stream) {
      stream?.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
    },
  };
}
