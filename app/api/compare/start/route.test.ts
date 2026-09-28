import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, rpc, maybeSingle } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  }),
}));

import { POST } from "./route";

function post(body: unknown) {
  return new Request("https://example.test/api/compare/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUser.mockReset();
  rpc.mockReset();
  maybeSingle.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  maybeSingle.mockResolvedValue({ data: { status: "inactive", manual_pro_until: null }, error: null });
  rpc.mockResolvedValue({ data: [{ outcome: "created", compare_id: "cmp" }], error: null });
});

describe("POST /api/compare/start", () => {
  it("returns 401 when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(post({ source: "chat_history", itemIds: ["a", "b"] }));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 400 for six ids", async () => {
    const response = await POST(post({ source: "chat_history", itemIds: ["a", "b", "c", "d", "e", "f"] }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 503 and skips the RPC when the tier lookup fails", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "down" } });
    const response = await POST(post({ source: "chat_history", itemIds: ["a", "b"] }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "entitlement_unavailable" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps session outcomes", async () => {
    const ok = await POST(post({ source: "chat_history", itemIds: ["b", "a"] }));
    expect(ok.status).toBe(200);
    for (const [outcome, status] of [
      ["upgrade_required", 402],
      ["too_many_items", 400],
      ["rate_limited", 429],
    ] as const) {
      rpc.mockResolvedValue({ data: [{ outcome, compare_id: null }], error: null });
      const response = await POST(post({ source: "chat_history", itemIds: ["a", "b"] }));
      expect(response.status).toBe(status);
    }
  });
});
