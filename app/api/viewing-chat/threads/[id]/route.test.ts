import { beforeEach, describe, expect, it, vi } from "vitest";

const query = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
};

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) },
  }),
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => query,
  }),
}));

import { PUT } from "./route";

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
