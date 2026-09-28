import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import { consumeAiQuota } from "./quota";

const request = new Request("https://example.test", {
  headers: { "x-forwarded-for": "203.0.113.5" },
});

beforeEach(() => {
  process.env.AI_QUOTA_HASH_SECRET = "quota-test-secret";
  rpc.mockReset();
});

afterEach(() => {
  delete process.env.AI_QUOTA_HASH_SECRET;
  delete process.env.AI_FREE_LIFETIME_LIMIT;
});

function args() {
  return rpc.mock.calls[0][1] as {
    p_keys: string[];
    p_limits: number[];
    p_window_seconds: number[];
  };
}

describe("tiered AI quota", () => {
  it("sends guest lifetime and guest IP windows", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true }], error: null });
    await expect(
      consumeAiQuota(request, { kind: "guest", guest: { guestId: "guest-1", deviceId: "device-1" } }),
    ).resolves.toEqual({ allowed: true, tier: "guest" });
    expect(rpc.mock.calls[0][0]).toBe("consume_ai_quota_v2");
    expect(args().p_keys[0]).toMatch(/^guest_l:[a-f0-9]{64}$/);
    expect(args().p_keys[1]).toMatch(/^ip:guest:[a-f0-9]{64}$/);
    expect(args().p_limits).toEqual([30, 60]);
    expect(args().p_window_seconds).toEqual([0, 86400]);
    expect(JSON.stringify(args().p_keys)).not.toContain("guest-1");
    expect(JSON.stringify(args().p_keys)).not.toContain("203.0.113.5");
    expect(JSON.stringify(args().p_keys)).not.toContain("device");
  });

  it("sends free lifetime and user IP windows", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true }], error: null });
    await consumeAiQuota(request, { kind: "user", userId: "user-1", tier: "free" });
    expect(args().p_keys[0]).toMatch(/^free_l:[a-f0-9]{64}$/);
    expect(args().p_keys[1]).toMatch(/^ip:user:[a-f0-9]{64}$/);
    expect(args().p_limits).toEqual([100, 300]);
    expect(args().p_window_seconds).toEqual([0, 86400]);
    expect(JSON.stringify(args().p_keys)).not.toContain("user-1");
  });

  it("sends the current Pro week key", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true }], error: null });
    await consumeAiQuota(request, { kind: "user", userId: "user-1", tier: "pro" }, new Date("2026-09-28T07:00:00Z"));
    expect(args().p_keys[0]).toMatch(/^pro_w:[a-f0-9]{64}:2026-09-28$/);
    expect(args().p_limits).toEqual([200, 300]);
    expect(args().p_window_seconds).toEqual([0, 86400]);
  });

  it("maps a blocked lifetime tier", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, blocked_index: 1, retry_after_seconds: null }], error: null });
    await expect(
      consumeAiQuota(request, { kind: "user", userId: "user-1", tier: "free" }),
    ).resolves.toEqual({
      allowed: false,
      code: "ai_quota_exceeded",
      tier: "free",
      limit: "tier",
      retryAfter: null,
      resetsAt: null,
    });
  });

  it("maps a blocked Pro week to next Monday 07:00Z", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, blocked_index: 1, retry_after_seconds: null }], error: null });
    await expect(
      consumeAiQuota(request, { kind: "user", userId: "user-1", tier: "pro" }, new Date("2026-09-28T07:00:00Z")),
    ).resolves.toMatchObject({
      tier: "pro",
      limit: "tier",
      resetsAt: "2026-10-05T07:00:00.000Z",
    });
  });

  it("maps a blocked network dimension", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, blocked_index: 2, retry_after_seconds: 40 }], error: null });
    await expect(
      consumeAiQuota(request, { kind: "user", userId: "user-1", tier: "free" }),
    ).resolves.toMatchObject({ limit: "network", retryAfter: 40 });
  });

  it("fails closed when the RPC or secret is missing", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "x" } });
    await expect(
      consumeAiQuota(request, { kind: "user", userId: "user-1", tier: "free" }),
    ).resolves.toEqual({ allowed: false, code: "ai_quota_unavailable", retryAfter: 60 });
    delete process.env.AI_QUOTA_HASH_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(
      consumeAiQuota(request, { kind: "guest", guest: { guestId: "g", deviceId: "d" } }),
    ).resolves.toMatchObject({ code: "ai_quota_unavailable" });
  });

  it("honors the free lifetime env override", async () => {
    process.env.AI_FREE_LIFETIME_LIMIT = "5";
    rpc.mockResolvedValue({ data: [{ allowed: true }], error: null });
    await consumeAiQuota(request, { kind: "user", userId: "user-1", tier: "free" });
    expect(args().p_limits[0]).toBe(5);
  });
});
