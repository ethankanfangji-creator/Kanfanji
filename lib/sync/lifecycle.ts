import type { SyncStatus, ViewingSession } from "@/lib/draft-db";

export type ViewingLifecycleState = SyncStatus | "deleted";

export type SyncLifecycleEvent =
  | "local_edit"
  | "enqueue"
  | "worker_start"
  | "commit"
  | "retryable_failure"
  | "terminal_failure"
  | "remote_conflict"
  | "explicit_retry";

const TRANSITIONS: Record<
  SyncLifecycleEvent,
  Partial<Record<SyncStatus, SyncStatus>>
> = {
  local_edit: {
    local_only: "local_only",
    pending: "pending",
    syncing: "pending",
    synced: "pending",
    failed: "pending",
    conflict: "conflict",
  },
  enqueue: {
    local_only: "pending",
    pending: "pending",
    syncing: "syncing",
    synced: "pending",
    failed: "pending",
    conflict: "conflict",
  },
  worker_start: {
    pending: "syncing",
    syncing: "syncing",
  },
  commit: {
    pending: "synced",
    syncing: "synced",
    synced: "synced",
  },
  retryable_failure: {
    pending: "pending",
    syncing: "pending",
  },
  terminal_failure: {
    pending: "failed",
    syncing: "failed",
    failed: "failed",
  },
  remote_conflict: {
    pending: "conflict",
    syncing: "conflict",
    conflict: "conflict",
  },
  explicit_retry: {
    failed: "pending",
    conflict: "pending",
  },
};

/**
 * Canonical ViewingSession sync transition. Returning the current state for an
 * invalid event keeps persisted data readable while callers can surface the
 * invalid transition in diagnostics instead of corrupting the lifecycle.
 */
export function transitionSyncStatus(
  current: SyncStatus,
  event: SyncLifecycleEvent,
): SyncStatus {
  return TRANSITIONS[event][current] ?? current;
}

export function canTransitionSyncStatus(
  current: SyncStatus,
  event: SyncLifecycleEvent,
): boolean {
  return TRANSITIONS[event][current] !== undefined;
}

export function getViewingLifecycleState(
  session: Pick<ViewingSession, "syncStatus" | "deletedAt">,
): ViewingLifecycleState {
  return session.deletedAt ? "deleted" : session.syncStatus;
}
