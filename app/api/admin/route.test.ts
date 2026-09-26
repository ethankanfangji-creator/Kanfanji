import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const insert = vi.fn();
const getUserById = vi.fn();
const updateUserById = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc,
    from: () => ({ insert }),
    auth: { admin: { getUserById, updateUserById } },
  }),
}));

const admin = {
  id: "admin-1",
  app_metadata: { role: "admin" },
  user_metadata: {},
};

function post(path: string, body: unknown) {
  return new Request(`http://test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin routes", () => {
  beforeEach(() => {
    vi.resetModules();
    getUser.mockReset();
    rpc.mockReset();
    insert.mockReset();
    getUserById.mockReset();
    updateUserById.mockReset();
    process.env.AI_QUOTA_HASH_SECRET = "quota-test-secret";
    getUser.mockResolvedValue({ data: { user: admin }, error: null });
    rpc.mockResolvedValue({ error: null });
    insert.mockResolvedValue({ error: null });
    updateUserById.mockResolvedValue({ error: null });
    getUserById.mockResolvedValue({
      data: { user: { id: "user-2", app_metadata: {}, banned_until: null } },
      error: null,
    });
  });

  it("returns 404 for a non-admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-2", app_metadata: {} } },
      error: null,
    });
    const { POST } = await import("./users/[id]/pro/route");
    const response = await POST(post("/api/admin/users/user-2/pro", { grant: false, reason: "test reason" }), {
      params: Promise.resolve({ id: "user-2" }),
    });
    expect(response.status).toBe(404);
  });

  it("grants and revokes manual Pro with an audit RPC", async () => {
    const { POST } = await import("./users/[id]/pro/route");
    const context = { params: Promise.resolve({ id: "user-2" }) };
    const grant = await POST(
      post("/api/admin/users/user-2/pro", {
        grant: true,
        until: "2026-12-01T00:00:00.000Z",
        reason: "comp months",
      }),
      context,
    );
    expect(grant.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_set_manual_pro", {
      p_actor_id: "admin-1",
      p_target_user_id: "user-2",
      p_grant: true,
      p_until: "2026-12-01T00:00:00.000Z",
      p_reason: "comp months",
    });

    const revoke = await POST(
      post("/api/admin/users/user-2/pro", { grant: false, reason: "comp ended" }),
      context,
    );
    expect(revoke.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith(
      "admin_set_manual_pro",
      expect.objectContaining({ p_grant: false, p_reason: "comp ended" }),
    );
  });

  it("rejects a short reason", async () => {
    const { POST } = await import("./users/[id]/pro/route");
    const response = await POST(post("/api/admin/users/user-2/pro", { grant: false, reason: "no" }), {
      params: Promise.resolve({ id: "user-2" }),
    });
    expect(response.status).toBe(400);
  });

  it("resets the user quota key and writes the audit RPC", async () => {
    const { POST } = await import("./users/[id]/quota/route");
    const response = await POST(post("/api/admin/users/user-2/quota", { reason: "support reset" }), {
      params: Promise.resolve({ id: "user-2" }),
    });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "admin_reset_ai_quota",
      expect.objectContaining({
        p_actor_id: "admin-1",
        p_target_user_id: "user-2",
        p_reason: "support reset",
        p_keys: [expect.stringMatching(/^user:[a-f0-9]{64}$/)],
      }),
    );
  });

  it("refuses to ban the signed-in admin", async () => {
    const { POST } = await import("./users/[id]/ban/route");
    const response = await POST(post("/api/admin/users/admin-1/ban", { ban: true, reason: "lock me" }), {
      params: Promise.resolve({ id: "admin-1" }),
    });
    expect(response.status).toBe(400);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("writes requested and succeeded audit rows for a ban", async () => {
    const { POST } = await import("./users/[id]/ban/route");
    const response = await POST(post("/api/admin/users/user-2/ban", { ban: true, reason: "abuse report" }), {
      params: Promise.resolve({ id: "user-2" }),
    });
    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ outcome: "requested", action: "user_ban" }),
    );
    expect(insert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ outcome: "succeeded", action: "user_ban" }),
    );
    expect(updateUserById).toHaveBeenCalledWith("user-2", { ban_duration: "876000h" });
  });
});
