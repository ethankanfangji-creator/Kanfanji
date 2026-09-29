import { describe, expect, it, vi } from "vitest";
import { pushViewingThread, syncedThreadIdsMissingFromCloud } from "./cloud-push";

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
