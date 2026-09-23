import { describe, expect, it } from "vitest";
import {
  canTransitionSyncStatus,
  getViewingLifecycleState,
  transitionSyncStatus,
  type SyncLifecycleEvent,
} from "./lifecycle";

describe("ViewingSession sync lifecycle", () => {
  it.each([
    ["local_only", "enqueue", "pending"],
    ["pending", "worker_start", "syncing"],
    ["syncing", "commit", "synced"],
    ["syncing", "retryable_failure", "pending"],
    ["syncing", "terminal_failure", "failed"],
    ["syncing", "remote_conflict", "conflict"],
    ["failed", "explicit_retry", "pending"],
    ["conflict", "explicit_retry", "pending"],
    ["synced", "local_edit", "pending"],
  ] as const)("%s + %s -> %s", (current, event, expected) => {
    expect(transitionSyncStatus(current, event)).toBe(expected);
  });

  it("does not invent a transition for an invalid event", () => {
    const event: SyncLifecycleEvent = "worker_start";
    expect(canTransitionSyncStatus("local_only", event)).toBe(false);
    expect(transitionSyncStatus("local_only", event)).toBe("local_only");
  });

  it("requires explicit retry to leave conflict", () => {
    expect(transitionSyncStatus("conflict", "enqueue")).toBe("conflict");
    expect(transitionSyncStatus("conflict", "local_edit")).toBe("conflict");
    expect(transitionSyncStatus("conflict", "explicit_retry")).toBe("pending");
  });

  it("projects soft-deleted sessions as a terminal UI lifecycle state", () => {
    expect(
      getViewingLifecycleState({
        syncStatus: "synced",
        deletedAt: "2026-09-17T00:00:00.000Z",
      }),
    ).toBe("deleted");
  });
});
