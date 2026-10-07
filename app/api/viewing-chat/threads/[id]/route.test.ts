import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = {
  list: vi.fn(),
  remove: vi.fn(),
};

const query = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) },
  }),
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => query,
    storage: { from: () => storage },
  }),
}));

import { DELETE, PUT } from "./route";

const message = {
  id: "m1",
  role: "user",
  type: "text",
  timestamp: "2026-09-28T00:00:00.000Z",
  text: "hi",
};

describe("PUT /api/viewing-chat/threads/:id", () => {
  beforeEach(() => {
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.update.mockReturnValue(query);
    query.delete.mockReturnValue(query);
    storage.list.mockResolvedValue({ data: [], error: null });
    storage.remove.mockResolvedValue({ error: null });
    query.maybeSingle.mockResolvedValue({
      data: { id: "11111111-1111-4111-8111-111111111111", user_id: "owner-1", messages: [message], revision: 2 },
      error: null,
    });
  });

  it("rejects garbage messages", async () => {
    const response = await PUT(
      new Request("http://test/threads/id", {
        method: "PUT",
        body: JSON.stringify({ messages: "garbage", chatState: { v: 1 } }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(400);
  });

  it("rejects a numeric chat state", async () => {
    const response = await PUT(
      new Request("http://test/threads/id", {
        method: "PUT",
        body: JSON.stringify({ messages: [message], chatState: 123 }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(400);
  });

  it("rejects a timestamp in 2099", async () => {
    const response = await PUT(
      new Request("http://test/threads/id", {
        method: "PUT",
        body: JSON.stringify({ clientUpdatedAt: "2099-01-01T00:00:00.000Z", chatState: { v: 1 } }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 for someone else's row", async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: { id: "x", user_id: "other", messages: [], revision: 1 }, error: null });
    const response = await PUT(
      new Request("http://test/threads/id", {
        method: "PUT",
        body: JSON.stringify({ messages: [message], chatState: { v: 1 } }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(404);
  });

  it("returns 409 when the revision is stale", async () => {
    const response = await PUT(
      new Request("http://test/threads/id", {
        method: "PUT",
        body: JSON.stringify({ baseRevision: 1, messages: [message], chatState: { v: 1 } }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(409);
  });

  it("keeps cloud fields when the client property record is null", async () => {
    query.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        user_id: "owner-1",
        messages: [message],
        revision: 2,
        chat_state: { v: 1, propertyRecord: { fields: { price: { value: "1500" }, floor: { value: "5" } } } },
      },
      error: null,
    });
    const response = await PUT(
      new Request("http://test/threads/id", {
        method: "PUT",
        body: JSON.stringify({
          baseRevision: 2,
          messages: [message],
          chatState: { v: 1, propertyRecord: null, pinned: true },
        }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(200);
    const patch = query.update.mock.calls.at(-1)?.[0] as {
      chat_state: { pinned: boolean; propertyRecord: { fields: { price: { value: string }; floor: { value: string } } } };
    };
    expect(patch.chat_state.propertyRecord.fields.price.value).toBe("1500");
    expect(patch.chat_state.propertyRecord.fields.floor.value).toBe("5");
    expect(patch.chat_state.pinned).toBe(true);
  });

  it("writes the owner's note snapshot so edits and deletes persist", async () => {
    const leftover = {
      ...message,
      id: "m2",
      text: "should be deleted",
    };
    query.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        user_id: "owner-1",
        messages: [message, leftover],
        revision: 2,
        chat_state: { v: 1 },
      },
      error: null,
    });
    const edited = { ...message, text: "採光其實不好" };
    const response = await PUT(
      new Request("http://test/threads/id", {
        method: "PUT",
        body: JSON.stringify({
          baseRevision: 2,
          messages: [edited],
          chatState: { v: 1 },
        }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(200);
    const patch = query.update.mock.calls.at(-1)?.[0] as { messages: Array<{ id: string; text: string }> };
    expect(patch.messages).toEqual([edited]);
  });

  it("requires a base revision when the row already exists", async () => {
    const response = await PUT(
      new Request("http://test/threads/id", {
        method: "PUT",
        body: JSON.stringify({ messages: [message], chatState: { v: 1 } }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(400);
  });

  it("deletes the owner's storage objects", async () => {
    query.maybeSingle.mockResolvedValueOnce({
      data: { id: "11111111-1111-4111-8111-111111111111" },
      error: null,
    });
    storage.list.mockImplementation(async (prefix: string) => ({
      data: prefix.endsWith("/photos") ? [{ name: "pic.jpg" }] : [],
      error: null,
    }));
    const response = await DELETE(new Request("http://test"), {
      params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
    });
    expect(response.status).toBe(200);
    expect(storage.remove).toHaveBeenCalledWith(["owner-1/11111111-1111-4111-8111-111111111111/photos/pic.jpg"]);
  });

  it("returns 413 when the body is over 2MB", async () => {
    const response = await PUT(
      new Request("http://test/threads/id", {
        method: "PUT",
        body: JSON.stringify({ messages: "x".repeat(2_000_001) }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(413);
  });
});
