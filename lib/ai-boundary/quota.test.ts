import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import { consumeAiQuota } from "./quota";

beforeEach(() => {
  process.env.AI_QUOTA_HASH_SECRET = "quota-test-secret";
  delete process.env.AI_GUEST_DAILY_LIMIT;
  delete process.env.AI_FREE_DAILY_LIMIT;
  delete process.env.AI_PRO_DAILY_LIMIT;
  delete process.env.AI_USER_DAILY_LIMIT;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.AI_QUOTA_HASH_SECRET;
});

describe("atomic AI quota adapter", () => {
  it("counts guest, device and IP dimensions in one RPC with guest limit", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });
    await expect(
      consumeAiQuota(
        new Request("https://example.test", { headers: { "x-forwarded-for": "203.0.113.5" } }),
        { kind: "guest", guest: { guestId: "guest-1", deviceId: "device-1" }, tier: "guest" },
      ),
    ).resolves.toEqual({ allowed: true, tier: "guest", limit: 5 });
    expect(rpc).toHaveBeenCalledTimes(1);
    const args = rpc.mock.calls[0][1];
    expect(args.p_keys).toHaveLength(3);
    expect(args.p_keys.map((key: string) => key.split(":")[0])).toEqual([
      "guest",
      "device",
      "ip",
    ]);
    expect(args.p_limits[0]).toBe(5);
  });

  it("uses free vs pro subject limits for authenticated users", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });
    await consumeAiQuota(new Request("https://example.test"), {
      kind: "user",
      userId: "user-1",
      deviceId: "device-1",
      tier: "free",
    });
    expect(rpc.mock.calls[0][1].p_limits[0]).toBe(20);

    rpc.mockClear();
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });
    await consumeAiQuota(new Request("https://example.test"), {
      kind: "user",
      userId: "user-1",
      deviceId: "device-1",
      tier: "pro",
    });
    expect(rpc.mock.calls[0][1].p_limits[0]).toBe(200);
  });

  it("returns tier/limit/resetAt when exceeded", async () => {
    rpc.mockResolvedValue({
      data: [{ allowed: false, retry_after_seconds: 120 }],
      error: null,
    });
    const result = await consumeAiQuota(new Request("https://example.test"), {
      kind: "user",
      userId: "user-1",
      deviceId: "device-1",
      tier: "free",
    });
    expect(result).toMatchObject({
      allowed: false,
      retryAfter: 120,
      code: "ai_quota_exceeded",
      tier: "free",
      limit: 20,
    });
    if (!result.allowed) {
      expect(Date.parse(result.resetAt)).toBeGreaterThan(Date.now());
    }
  });

  it("fails closed when the migration/RPC is absent", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    await expect(
      consumeAiQuota(new Request("https://example.test"), {
        kind: "user",
        userId: "user-1",
        deviceId: "device-1",
        tier: "free",
      }),
    ).resolves.toMatchObject({
      allowed: false,
      retryAfter: 60,
      code: "ai_quota_unavailable",
      tier: "free",
      limit: 20,
    });
  });

  it("fails closed on a malformed RPC response", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(
      consumeAiQuota(new Request("https://example.test"), {
        kind: "user",
        userId: "user-1",
        deviceId: "device-1",
        tier: "pro",
      }),
    ).resolves.toMatchObject({
      allowed: false,
      code: "ai_quota_unavailable",
      tier: "pro",
      limit: 200,
    });
  });
});
