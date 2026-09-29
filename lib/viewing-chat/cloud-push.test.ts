import { describe, expect, it, vi } from "vitest";
import { pushViewingThread } from "./cloud-push";

describe("pushViewingThread", () => {
  it("creates the row when the cloud copy is missing, then puts with a revision", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if ((init?.method ?? "GET") === "GET") return new Response("{}", { status: 404 });
      if (init?.method === "POST") return new Response(JSON.stringify({ revision: 1 }), { status: 201 });
      const body = JSON.parse(String(init?.body)) as { baseRevision?: number };
      expect(body.baseRevision).toBe(1);
      return new Response(JSON.stringify({ revision: 2 }), { status: 200 });
    });
    const result = await pushViewingThread({
      threadId: "thread-1",
      address: "1 Main",
      messages: [],
      chatState: { v: 1 },
      clientUpdatedAt: "2026-09-28T00:00:00.000Z",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe(200);
    expect(result.revision).toBe(2);
    expect(calls.map((call) => call.split(" ")[0])).toEqual(["GET", "POST", "PUT"]);
  });
});
