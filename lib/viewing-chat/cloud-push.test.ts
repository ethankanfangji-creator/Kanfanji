import { describe, expect, it, vi } from "vitest";
import { pushViewingThread } from "./cloud-push";

describe("pushViewingThread", () => {
  it("creates the row when the first put is missing, then puts", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`);
      if (init?.method === "PUT" && calls.filter((item) => item.startsWith("PUT")).length === 1) {
        return new Response("{}", { status: 404 });
      }
      if (init?.method === "POST") return new Response("{}", { status: 201 });
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
    expect(calls[0]).toContain("PUT");
    expect(calls[1]).toContain("POST");
    expect(calls[2]).toContain("PUT");
  });
});
