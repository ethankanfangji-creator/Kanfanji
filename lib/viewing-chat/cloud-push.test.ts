import { describe, expect, it, vi } from "vitest";
import {
  pushViewingThread,
  pushViewingThreadWithConflictRetry,
  syncedThreadIdsMissingFromCloud,
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

describe("pushViewingThreadWithConflictRetry", () => {
  it("retries the PUT with the remote revision after a briefing/report bump", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);
      if (method === "PUT") {
        const body = JSON.parse(String(init?.body)) as { baseRevision?: number };
        if (body.baseRevision === 5) {
          return new Response(JSON.stringify({ code: "stale", serverRevision: 6 }), { status: 409 });
        }
        expect(body.baseRevision).toBe(6);
        expect(body.messages).toEqual([{ id: "note-1", text: "漏水" }]);
        return new Response(JSON.stringify({ revision: 7 }), { status: 200 });
      }
      return new Response(JSON.stringify({ revision: 6, messages: [] }), { status: 200 });
    });
    const result = await pushViewingThreadWithConflictRetry({
      threadId: "thread-1",
      address: "1 Main",
      baseRevision: 5,
      previouslySynced: true,
      messages: [{ id: "note-1", text: "漏水" }],
      chatState: { v: 1 },
      clientUpdatedAt: "2026-10-04T12:00:00.000Z",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe(200);
    expect(result.revision).toBe(7);
    expect(calls).toEqual([
      "PUT /api/viewing-chat/threads/thread-1",
      "GET /api/viewing-chat/threads/thread-1",
      "PUT /api/viewing-chat/threads/thread-1",
    ]);
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
