import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, rpc, insert, tier } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(),
  tier: { value: "free" as "free" | "pro" },
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/entitlement/tier", () => ({
  getAccountTier: async () => tier.value,
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc,
    from: (table: string) => {
      if (table === "viewings") {
        return {
          select: () => ({
            eq: () => ({
              in: async (_column: string, ids: string[]) => ({
                data: ids.map((id) => ({ id })),
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        insert: (row: unknown) => {
          insert(row);
          return {
            select: () => ({
              single: async () => ({ data: { share_code: "K7NP3Q" }, error: null }),
            }),
          };
        },
      };
    },
  }),
}));

import { POST } from "./route";

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
];

function post(viewingIds: string[]) {
  return POST(
    new Request("https://example.test/api/discussion-rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewingIds }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tier.value = "free";
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  rpc.mockResolvedValue({ data: [{ outcome: "too_many_items", compare_id: null }], error: null });
});

describe("POST /api/discussion-rooms", () => {
  it("requires login", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await post(ids.slice(0, 2));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("blocks a free account from comparing three houses", async () => {
    const response = await post(ids.slice(0, 3));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "too_many_items", maxItems: 2 });
    expect(rpc).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("blocks a pro account from comparing six houses", async () => {
    tier.value = "pro";
    const response = await post(ids);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "too_many_items", maxItems: 5 });
    expect(insert).not.toHaveBeenCalled();
  });
});
