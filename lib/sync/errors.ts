import type { ClassifiedSyncError, SyncErrorCode } from "./types";

const FILE_TOO_LARGE_RE =
  /too large|payload too large|maximum size|entity too large|413|file size/i;
const PERMISSION_RE =
  /請先登入|not authenticated|jwt|unauthorized|forbidden|permission|row-level security|401|403|rls/i;
const NETWORK_RE =
  /failed to fetch|networkerror|network request failed|net::err|econnreset|etimedout|offline|load failed/i;

export function classifySyncError(error: unknown, online = true): ClassifiedSyncError {
  if (!online) {
    return {
      code: "offline",
      message: "目前離線，變更已保存在本機，恢復網路後會繼續同步",
      retryable: true,
    };
  }

  const message = error instanceof Error ? error.message : String(error ?? "未知錯誤");

  if (NETWORK_RE.test(message)) {
    return {
      code: "network",
      message: "網路中斷，無法同步。請檢查連線後重試",
      retryable: true,
    };
  }
  if (PERMISSION_RE.test(message)) {
    return {
      code: "permission",
      message: "沒有權限同步（請重新登入後再試）",
      retryable: false,
    };
  }
  if (FILE_TOO_LARGE_RE.test(message)) {
    return {
      code: "file_too_large",
      message: "檔案過大，無法上傳。請壓縮後再試",
      retryable: false,
    };
  }

  return {
    code: "api" satisfies SyncErrorCode,
    message: message || "同步失敗，請稍後重試",
    retryable: true,
  };
}

export function backoffMs(attempts: number): number {
  const base = Math.min(60_000, 1000 * 2 ** Math.max(0, attempts - 1));
  return base;
}
