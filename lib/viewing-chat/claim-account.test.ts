import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markThreadDeletedHere } from "./cloud-push";

vi.mock("./media-library", () => ({
  removeMediaByThread: async () => 0,
}));

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
  };
}

describe("pullCloudThreads", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: memoryStorage(), sessionStorage: memoryStorage() },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("does not restore a thread this device just deleted", async () => {
    markThreadDeletedHere("11111111-1111-4111-8111-111111111111");
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === "/api/viewing-chat/threads") {
        return new Response(
          JSON.stringify({
            threads: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                updatedAt: "2026-09-29T00:00:00.000Z",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          id: "11111111-1111-4111-8111-111111111111",
          address: "1 Main",
          messages: [{ id: "m1", role: "user", type: "text", timestamp: "2026-09-29T00:00:00.000Z" }],
          report: { summary: "should not land locally" },
          metadata: null,
          chat_state: { v: 1 },
          revision: 4,
          updated_at: "2026-09-29T00:00:00.000Z",
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const { pullCloudThreads } = await import("./claim-account");
    const { getLocalThread } = await import("./local-store");
    await pullCloudThreads("user-1");
    expect(calls).toEqual(["/api/viewing-chat/threads"]);
    expect(getLocalThread("11111111-1111-4111-8111-111111111111")).toBeNull();
  });
});
