import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import { consumeAiQuota } from "./quota";

beforeEach(() => {
  process.env.AI_QUOTA_HASH_SECRET = "quota-test-secret";
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.AI_QUOTA_HASH_SECRET;
});

describe("atomic AI quota adapter", () => {
  it("counts guest, device and IP dimensions in one RPC", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });
    await expect(
      consumeAiQuota(
        new Request("https://example.test", { headers: { "x-forwarded-for": "203.0.113.5" } }),
        { kind: "guest", guest: { guestId: "guest-1", deviceId: "device-1" } },
      ),
    ).resolves.toEqual({ allowed: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    const args = rpc.mock.calls[0][1];
    expect(args.p_keys).toHaveLength(3);
    expect(args.p_keys.map((key: string) => key.split(":")[0])).toEqual([
      "guest",
      "device",
      "ip",
    ]);
  });

  it("fails closed when the migration/RPC is absent", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    await expect(
      consumeAiQuota(new Request("https://example.test"), {
        kind: "user",
        userId: "user-1",
        deviceId: "device-1",
      }),
    ).resolves.toEqual({
      allowed: false,
      retryAfter: 60,
      code: "ai_quota_unavailable",
    });
  });

  it("fails closed on a malformed RPC response", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(
      consumeAiQuota(new Request("https://example.test"), {
        kind: "user",
        userId: "user-1",
        deviceId: "device-1",
      }),
    ).resolves.toMatchObject({
      allowed: false,
      code: "ai_quota_unavailable",
    });
  });
});
