import type { SyncStatus } from "@/lib/draft-db";
import type { MergeDecision, RemoteViewingSnapshot, SessionUiStatus } from "./types";

export function syncStatusToUi(status: SyncStatus, errorMessage?: string | null): SessionUiStatus {
  switch (status) {
    case "local_only":
      return {
        status,
        labelKey: "savedLocal",
        errorMessage: null,
        canRetry: false,
      };
    case "pending":
      return {
        status,
        labelKey: "pending",
        errorMessage: null,
        canRetry: true,
      };
    case "syncing":
      return {
        status,
        labelKey: "syncing",
        errorMessage: null,
        canRetry: false,
      };
    case "synced":
      return {
        status,
        labelKey: "synced",
        errorMessage: null,
        canRetry: false,
      };
    case "failed":
      return {
        status,
        labelKey: "failed",
        errorMessage: errorMessage ?? "同步失敗",
        canRetry: true,
      };
    case "conflict":
      return {
        status,
        labelKey: "conflict",
        errorMessage: errorMessage ?? "本機與雲端資料衝突，未覆寫任一方",
        canRetry: true,
      };
    default:
      return {
        status: "local_only",
        labelKey: "savedLocal",
        errorMessage: null,
        canRetry: false,
      };
  }
}

/**
 * Safe merge: never silently overwrite.
 * - Local newer / equal → push
 * - Remote newer + local clean (already synced, no pending work) → skip
 * - Remote newer + local dirty → conflict
 */
export function decideMerge(input: {
  localClientUpdatedAt: string;
  localSyncStatus: SyncStatus;
  hasUnsyncedMedia: boolean;
  remote: RemoteViewingSnapshot | null;
}): MergeDecision {
  if (!input.remote?.clientUpdatedAt) return "push";

  const localTs = Date.parse(input.localClientUpdatedAt) || 0;
  const remoteTs = Date.parse(input.remote.clientUpdatedAt) || 0;

  if (!remoteTs || localTs >= remoteTs) return "push";

  const localDirty =
    input.hasUnsyncedMedia ||
    input.localSyncStatus === "pending" ||
    input.localSyncStatus === "failed" ||
    input.localSyncStatus === "local_only" ||
    input.localSyncStatus === "conflict";

  if (localDirty) return "conflict";
  return "skip_remote_newer_clean";
}
