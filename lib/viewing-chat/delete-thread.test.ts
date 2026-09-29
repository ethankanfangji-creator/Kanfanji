// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteViewingThread } from "./delete-thread";
import { createLocalThread, getLocalThread, patchLocalThread } from "./local-store";

describe("deleteViewingThread", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("removes the local row after a successful delete and the list no longer has it", async () => {
    const thread = createLocalThread("10 Oak St, Vancouver, BC", [], null);
    patchLocalThread(thread.id, { ownerUserId: "user-1", cloud: { state: "synced" } });
    const seen = new Set([thread.id]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "DELETE") {
        seen.delete(thread.id);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith("/api/viewing-chat/threads")) {
        return new Response(
          JSON.stringify({ threads: [...seen].map((id) => ({ id })) }),
          { status: 200 },
        );
      }
      return new Response("no", { status: 500 });
    });
    const result = await deleteViewingThread({ id: thread.id, userId: "user-1", fetchImpl: fetchMock });
    expect(result).toBe("removed");
    expect(getLocalThread(thread.id)).toBeNull();
    const listed = await (await fetchMock("/api/viewing-chat/threads")).json();
    expect(listed.threads).toEqual([]);
  });

  it("keeps the local row when DELETE fails", async () => {
    const thread = createLocalThread("11 Oak St, Vancouver, BC", [], null);
    patchLocalThread(thread.id, { ownerUserId: "user-1", cloud: { state: "synced" } });
    const fetchMock = vi.fn(async () => new Response("no", { status: 500 }));
    const result = await deleteViewingThread({ id: thread.id, userId: "user-1", fetchImpl: fetchMock });
    expect(result).toBe("failed");
    expect(getLocalThread(thread.id)?.address).toContain("11 Oak");
  });
});
