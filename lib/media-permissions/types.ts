export type MediaPermissionName = "microphone" | "camera";

/**
 * App-level permission / capture readiness states.
 * - granted / prompt / denied: Permissions API (or inferred)
 * - blocked: permanent deny / cannot re-prompt in-page
 * - unsupported: no mediaDevices / MediaRecorder
 * - in-use: device busy (NotReadableError)
 * - permission-revoked: was granted, then lost mid-session
 */
export type MediaPermissionStatus =
  | "granted"
  | "prompt"
  | "denied"
  | "blocked"
  | "unsupported"
  | "in-use"
  | "permission-revoked";

export type CaptureKind = "audio" | "video" | "photo";

export type MediaPermissionRequestResult =
  | { ok: true; stream: MediaStream; status: "granted" }
  | { ok: false; status: MediaPermissionStatus; error: Error };

export type MediaPermissionAdapter = {
  /** Whether getUserMedia / Permissions APIs exist enough to attempt capture. */
  isMediaDevicesSupported(): boolean;
  /** Whether MediaRecorder exists (audio in-app recording). */
  isMediaRecorderSupported(): boolean;
  query(name: MediaPermissionName): Promise<MediaPermissionStatus>;
  /**
   * Request mic/camera via getUserMedia. Call only after user gesture + preflight.
   * Caller owns the stream and must release tracks when done.
   */
  request(
    name: MediaPermissionName,
    constraints?: MediaStreamConstraints,
  ): Promise<MediaPermissionRequestResult>;
  release(stream: MediaStream | null | undefined): void;
};

export type ClassifiedMediaError = {
  status: MediaPermissionStatus;
  message: string;
  /** True when OS settings / another app may clear the condition. */
  recoverable: boolean;
};
