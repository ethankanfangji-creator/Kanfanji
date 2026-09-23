import type { SyncStatus } from "./types";

/** Map legacy / external status strings onto the canonical SyncStatus set. */
export function normalizeSyncStatus(raw: string | null | undefined): SyncStatus {
  switch (raw) {
    case "local_only":
    case "pending":
    case "syncing":
    case "synced":
    case "failed":
    case "conflict":
      return raw;
    case "local":
      return "local_only";
    case "pending_upload":
      return "pending";
    case "error":
      return "failed";
    default:
      return "local_only";
  }
}

export function isTerminalSyncStatus(status: SyncStatus): boolean {
  return status === "synced" || status === "conflict";
}

export function isRetryableSyncStatus(status: SyncStatus): boolean {
  return status === "failed" || status === "pending" || status === "local_only";
}
