import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

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

vi.mock("@/lib/analytics/server", () => ({
  serverTrack: vi.fn(),
}));

import { POST } from "./route";

const snapshot = {
  version: 2,
  source: "chat_history",
  createdAt: "2026-09-28T00:00:00.000Z",
  rows: ["address"],
  columns: [
    { title: "100 Main", cells: { address: { text: "100 Main" } } },
    { title: "200 Main", cells: { address: { text: "200 Main" } } },
  ],
};

function post(body: unknown) {
  return new Request("https://example.test/api/compare/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUser.mockReset();
  rpc.mockReset();
  maybeSingle.mockReset();
  process.env.AI_QUOTA_HASH_SECRET = "not-used";
  maybeSingle.mockResolvedValue({ data: { status: "inactive", manual_pro_until: null }, error: null });
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  rpc.mockResolvedValue({
    data: [{ outcome: "created", share_id: "share-1", expires_at: "2026-10-28T00:00:00.000Z" }],
    error: null,
  });
});

describe("POST /api/compare/shares", () => {
  it("returns 401 when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(post({ compareId: "id", snapshot, acknowledgeAddresses: true }));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 400 when acknowledgement is missing", async () => {
    const response = await POST(post({ compareId: "id", snapshot }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 503 when the tier lookup fails and does not call the RPC", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "down" } });
    const response = await POST(post({ compareId: "id", snapshot, acknowledgeAddresses: true }));
    expect(response.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps RPC outcomes and returns a hashed token only inside the RPC args", async () => {
    const created = await POST(post({ compareId: "cmp-1", snapshot, acknowledgeAddresses: true }));
    expect(created.status).toBe(201);
    const payload = (await created.json()) as { url: string };
    const token = payload.url.split("/c/")[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const args = rpc.mock.calls[0][1] as { p_token_hash: string; p_snapshot: unknown };
    expect(args.p_token_hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(args)).not.toContain(token);
    expect(args.p_token_hash).toMatch(/^[a-f0-9]{64}$/);

    for (const [outcome, status] of [
      ["not_found", 404],
      ["upgrade_required", 402],
      ["too_many_items", 400],
      ["rate_limited", 429],
    ] as const) {
      rpc.mockResolvedValue({ data: [{ outcome, share_id: null, expires_at: null }], error: null });
      const response = await POST(post({ compareId: "cmp-1", snapshot, acknowledgeAddresses: true }));
      expect(response.status).toBe(status);
    }
  });
});
