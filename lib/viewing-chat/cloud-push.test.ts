import { describe, expect, it, vi } from "vitest";
import {
  isLocalThreadNewer,
  pushViewingThread,
  syncedThreadIdsMissingFromCloud,
  withCloudSyncState,
} from "./cloud-push";

describe("pushViewingThread", () => {
  it("creates an unsynced thread with POST then PUT and does not GET", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "POST") return new Response(JSON.stringify({ revision: 1 }), { status: 201 });
      const body = JSON.parse(String(init?.body)) as { baseRevision?: number };
      expect(body.baseRevision).toBe(1);
      return new Response(JSON.stringify({ revision: 2 }), { status: 200 });
    });
    const result = await pushViewingThread({
      threadId: "thread-1",
      address: "1 Main",
      previouslySynced: false,
      messages: [],
      chatState: { v: 1 },
      clientUpdatedAt: "2026-09-28T00:00:00.000Z",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe(200);
    expect(calls.map((call) => call.split(" ")[0])).toEqual(["POST", "PUT"]);
  });

  it("treats a synced thread with no local revision as a conflict instead of overwriting", async () => {
    const calls: string[] = [];
    const remote = { revision: 4, messages: [{ id: "cloud" }], chat_state: { v: 1, pinned: true } };
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init?.method ?? "GET");
      return new Response(JSON.stringify(remote), { status: 200 });
    });
    const result = await pushViewingThread({
      threadId: "thread-1",
      address: "1 Main",
      previouslySynced: true,
      messages: [{ id: "local" }],
      chatState: { v: 1, propertyRecord: null },
      clientUpdatedAt: "2026-09-28T00:00:00.000Z",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe(409);
    expect(result.revision).toBe(4);
    expect(result.remote?.messages).toEqual([{ id: "cloud" }]);
    expect(calls).toEqual(["GET"]);
  });

  it("does not recreate a thread that was already synced when the row is gone", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init?.method ?? "GET");
      return new Response("{}", { status: 404 });
    });
    const result = await pushViewingThread({
      threadId: "thread-1",
      address: "1 Main",
      baseRevision: 3,
      previouslySynced: true,
      messages: [],
      chatState: { v: 1 },
      clientUpdatedAt: "2026-09-28T00:00:00.000Z",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.deleted).toBe(true);
    expect(calls).toEqual(["PUT"]);
  });
});

describe("syncedThreadIdsMissingFromCloud", () => {
  it("drops a synced local thread that the other device deleted", () => {
    const removed = syncedThreadIdsMissingFromCloud(
      [
        { id: "x", ownerUserId: "user", cloud: { state: "synced" } },
        { id: "y", ownerUserId: "user", cloud: { state: "synced" } },
        { id: "z", ownerUserId: "user", cloud: { state: "syncing" } },
      ],
      new Set(["y"]),
      "user",
    );
    expect(removed).toEqual(["x"]);
  });
});

describe("cloud sync metadata helpers", () => {
  it("keeps revision when a later sync is marked failed", () => {
    expect(
      withCloudSyncState({ state: "synced", revision: 7, lastSyncedAt: "2026-09-28T00:00:00.000Z" }, "failed"),
    ).toEqual({
      state: "failed",
      revision: 7,
      lastSyncedAt: "2026-09-28T00:00:00.000Z",
    });
  });

  it("treats equal or newer local timestamps as the source of truth", () => {
    expect(isLocalThreadNewer("2026-09-30T12:00:00.000Z", "2026-09-30T11:00:00.000Z")).toBe(true);
    expect(isLocalThreadNewer("2026-09-30T12:00:00.000Z", "2026-09-30T12:00:00.000Z")).toBe(true);
    expect(isLocalThreadNewer("2026-09-30T11:00:00.000Z", "2026-09-30T12:00:00.000Z")).toBe(false);
    expect(isLocalThreadNewer(undefined, "2026-09-30T12:00:00.000Z")).toBe(false);
  });
});
