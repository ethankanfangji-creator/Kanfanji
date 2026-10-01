// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimAccountThreads, pullCloudThreads } from "./claim-account";
import { createLocalThread, getLocalThread, patchLocalThread } from "./local-store";

describe("guest address survives login refresh", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("keeps a just-claimed thread when the list omits it but the row still exists", async () => {
    const thread = createLocalThread("2143 Spring Street, Port Moody, BC", [], null);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/api/viewing-chat/threads")) {
        return new Response(JSON.stringify({ revision: 2, outcome: "created" }), { status: 201 });
      }
      if (url === "/api/viewing-chat/threads") {
        return new Response(JSON.stringify({ threads: [] }), { status: 200 });
      }
      if (url.endsWith(`/api/viewing-chat/threads/${thread.id}`)) {
        return new Response(
          JSON.stringify({
            id: thread.id,
            address: thread.address,
            messages: [],
            report: null,
            metadata: null,
            chat_state: { v: 1 },
            revision: 2,
            updated_at: thread.updatedAt,
          }),
          { status: 200 },
        );
      }
      return new Response("no", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await claimAccountThreads("user-1");
    await pullCloudThreads("user-1");
    expect(getLocalThread(thread.id)?.address).toBe("2143 Spring Street, Port Moody, BC");
    expect(getLocalThread(thread.id)?.cloud?.state).toBe("synced");
    vi.unstubAllGlobals();
  });

  it("leaves the local row and marks failure when claim does not succeed", async () => {
    const thread = createLocalThread("99 Main St, Vancouver, BC", [], null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );
    await claimAccountThreads("user-2");
    const stored = getLocalThread(thread.id);
    expect(stored).toBeTruthy();
    expect(stored?.ownerUserId ?? null).toBeNull();
    expect(stored?.cloud?.state).toBe("failed");
    expect(stored?.cloud?.state).not.toBe("synced");
    vi.unstubAllGlobals();
  });
});

describe("pull keeps newer local answers after a failed sync", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("does not replace local collection state with a stale cloud stub", async () => {
    const thread = createLocalThread("2143 Spring Street, Port Moody, BC", [], null);
    patchLocalThread(thread.id, {
      ownerUserId: "user-1",
      cloud: { state: "failed", revision: 2 },
      propertyRecord: {
        fields: {
          layout: { value: "3 bed 2 bath", status: "confirmed" },
        },
      },
    });
    const local = getLocalThread(thread.id);
    expect(local).toBeTruthy();
    const remoteUpdatedAt = new Date(Date.parse(local!.updatedAt) - 60_000).toISOString();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/viewing-chat/threads") {
        return new Response(
          JSON.stringify({ threads: [{ id: thread.id, updatedAt: remoteUpdatedAt }] }),
          { status: 200 },
        );
      }
      if (url.endsWith(`/api/viewing-chat/threads/${thread.id}`)) {
        return new Response(
          JSON.stringify({
            id: thread.id,
            address: thread.address,
            messages: [],
            report: null,
            metadata: null,
            chat_state: {
              v: 1,
              propertyRecord: { fields: { address: { value: thread.address } } },
            },
            revision: 2,
            updated_at: remoteUpdatedAt,
          }),
          { status: 200 },
        );
      }
      return new Response("no", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await pullCloudThreads("user-1");
    const stored = getLocalThread(thread.id);
    expect(stored?.propertyRecord).toMatchObject({
      fields: { layout: { value: "3 bed 2 bath", status: "confirmed" } },
    });
    expect(stored?.updatedAt).toBe(local!.updatedAt);
    expect(stored?.cloud?.revision).toBe(2);
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith(`/api/viewing-chat/threads/${thread.id}`))).toBe(
      false,
    );
    vi.unstubAllGlobals();
  });

  it("still hydrates from cloud when the remote row is newer", async () => {
    const thread = createLocalThread("99 Main St, Vancouver, BC", [], null);
    patchLocalThread(thread.id, {
      ownerUserId: "user-1",
      cloud: { state: "failed", revision: 2 },
      propertyRecord: {
        fields: {
          layout: { value: "stale local", status: "confirmed" },
        },
      },
    });
    const local = getLocalThread(thread.id);
    const remoteUpdatedAt = new Date(Date.parse(local!.updatedAt) + 60_000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/viewing-chat/threads") {
          return new Response(
            JSON.stringify({ threads: [{ id: thread.id, updatedAt: remoteUpdatedAt }] }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            id: thread.id,
            address: thread.address,
            messages: [],
            report: null,
            metadata: null,
            chat_state: {
              v: 1,
              propertyRecord: { fields: { layout: { value: "newer cloud", status: "confirmed" } } },
            },
            revision: 3,
            updated_at: remoteUpdatedAt,
          }),
          { status: 200 },
        );
      }),
    );
    await pullCloudThreads("user-1");
    const stored = getLocalThread(thread.id);
    expect(stored?.propertyRecord).toMatchObject({
      fields: { layout: { value: "newer cloud", status: "confirmed" } },
    });
    expect(stored?.cloud?.state).toBe("synced");
    vi.unstubAllGlobals();
  });

  it("does not apply a stale cloud row to a still-syncing local thread", async () => {
    const thread = createLocalThread("8 Water St, Vancouver, BC", [], null);
    patchLocalThread(thread.id, {
      ownerUserId: "user-1",
      cloud: { state: "syncing", revision: 4 },
      propertyRecord: {
        fields: {
          noise: { value: "quiet after 8pm", status: "confirmed" },
        },
      },
    });
    const local = getLocalThread(thread.id);
    const remoteUpdatedAt = new Date(Date.parse(local!.updatedAt) - 60_000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/viewing-chat/threads") {
          return new Response(JSON.stringify({ threads: [] }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            id: thread.id,
            address: thread.address,
            messages: [],
            report: null,
            metadata: null,
            chat_state: { v: 1, propertyRecord: { fields: {} } },
            revision: 4,
            updated_at: remoteUpdatedAt,
          }),
          { status: 200 },
        );
      }),
    );
    await pullCloudThreads("user-1");
    const stored = getLocalThread(thread.id);
    expect(stored?.propertyRecord).toMatchObject({
      fields: { noise: { value: "quiet after 8pm", status: "confirmed" } },
    });
    expect(stored?.cloud?.state).toBe("syncing");
    expect(stored?.cloud?.revision).toBe(4);
    vi.unstubAllGlobals();
  });
});

describe("pull does not revive a thread deleted on the server", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("removes a synced local row when the detail request is 404", async () => {
    const thread = createLocalThread("1 Gone St, Vancouver, BC", [], null);
    patchLocalThread(thread.id, {
      ownerUserId: "user-1",
      cloud: { state: "synced", revision: 3 },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/viewing-chat/threads") {
          return new Response(JSON.stringify({ threads: [] }), { status: 200 });
        }
        return new Response("missing", { status: 404 });
      }),
    );
    await pullCloudThreads("user-1");
    expect(getLocalThread(thread.id)).toBeNull();
    vi.unstubAllGlobals();
  });
});
