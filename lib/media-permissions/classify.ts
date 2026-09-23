import type {
  ClassifiedMediaError,
  MediaPermissionName,
  MediaPermissionStatus,
} from "./types";

const DENIED_RE = /notallowed|permissiondenied|permission denied|user denied/i;
const NOT_FOUND_RE = /notfound|devices not found|requested device not found/i;
const IN_USE_RE = /notreadable|trackstart|could not start|device in use|busy/i;
const ABORT_RE = /abort(error)?|interrupted/i;
const UNSUPPORTED_RE = /notsupported|typeerror|undefined is not/i;

export function mapPermissionState(
  state: PermissionState | string | undefined,
): MediaPermissionStatus {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  if (state === "prompt") return "prompt";
  return "prompt";
}

/**
 * Classify getUserMedia / MediaRecorder failures into UX statuses.
 * `prior` helps distinguish first-time deny vs blocked / revoked.
 */
export function classifyMediaError(
  error: unknown,
  options?: {
    name?: MediaPermissionName;
    prior?: MediaPermissionStatus;
  },
): ClassifiedMediaError {
  const name = options?.name ?? "microphone";
  const prior = options?.prior;
  const err = error instanceof Error ? error : new Error(String(error ?? "unknown"));
  const code = "name" in err ? String((err as { name?: string }).name || "") : "";
  const text = `${code} ${err.message}`;

  if (
    prior === "granted" &&
    (DENIED_RE.test(text) || code === "NotAllowedError" || code === "SecurityError")
  ) {
    return {
      status: "permission-revoked",
      message: "權限已在系統中被撤銷，請到瀏覽器設定重新開啟後再試",
      recoverable: true,
    };
  }

  if (code === "NotAllowedError" || code === "PermissionDeniedError" || DENIED_RE.test(text)) {
    if (prior === "denied" || prior === "blocked") {
      return {
        status: "blocked",
        message: "權限已被封鎖，請到瀏覽器／系統設定手動開啟",
        recoverable: true,
      };
    }
    return {
      status: "denied",
      message: name === "camera" ? "相機權限被拒絕" : "麥克風權限被拒絕",
      recoverable: true,
    };
  }

  if (code === "NotReadableError" || code === "TrackStartError" || IN_USE_RE.test(text)) {
    return {
      status: "in-use",
      message: "裝置正被其他 App 使用，請關閉後再試",
      recoverable: true,
    };
  }

  if (code === "NotFoundError" || code === "DevicesNotFoundError" || NOT_FOUND_RE.test(text)) {
    return {
      status: "unsupported",
      message: name === "camera" ? "找不到可用相機" : "找不到可用麥克風",
      recoverable: false,
    };
  }

  if (code === "NotSupportedError" || UNSUPPORTED_RE.test(text)) {
    return {
      status: "unsupported",
      message: "此瀏覽器不支援所需的媒體功能",
      recoverable: false,
    };
  }

  if (code === "AbortError" || ABORT_RE.test(text)) {
    return {
      status: prior === "granted" ? "permission-revoked" : "denied",
      message: "媒體請求被中斷，請再試一次",
      recoverable: true,
    };
  }

  if (code === "SecurityError") {
    return {
      status: "blocked",
      message: "安全限制無法取用媒體（請使用 HTTPS 或本機 localhost）",
      recoverable: true,
    };
  }

  return {
    status: "denied",
    message: err.message || "無法取得媒體權限",
    recoverable: true,
  };
}

export function isBlockingPermissionStatus(status: MediaPermissionStatus): boolean {
  return (
    status === "denied" ||
    status === "blocked" ||
    status === "unsupported" ||
    status === "in-use" ||
    status === "permission-revoked"
  );
}

export function canPromptInPage(status: MediaPermissionStatus): boolean {
  return status === "granted" || status === "prompt";
}
