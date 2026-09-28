import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import { consumeIntelRateLimit, intelQuotaPlan } from "./rate-limit.server";

beforeEach(() => {
  process.env.AI_QUOTA_HASH_SECRET = "intel-test-secret";
  delete process.env.INTEL_GUEST_DAILY_LIMIT;
  delete process.env.INTEL_USER_DAILY_LIMIT;
  rpc.mockReset();
});

describe("intel quota plan", () => {
  it("hashes identities and keeps guest and user prefixes distinct", () => {
    const userId = "plaintext-user-SHOULD-NOT-APPEAR";
    const ip = "203.0.113.9-SHOULD-NOT-APPEAR";
    const user = intelQuotaPlan({ userId, guestId: null }, ip);
    const guest = intelQuotaPlan({ userId: null, guestId: "plaintext-guest-SHOULD-NOT-APPEAR" }, ip);
    expect(user.keys.join(" ")).not.toContain(userId);
    expect(user.keys.join(" ")).not.toContain(ip);
    expect(user.keys[0]?.startsWith("intel:u:")).toBe(true);
    expect(user.keys[1]?.startsWith("intel:ip:u:")).toBe(true);
    expect(guest.keys[0]?.startsWith("intel:g:")).toBe(true);
    expect(guest.keys[1]?.startsWith("intel:ip:g:")).toBe(true);
    expect(user.limits).toEqual([100, 300]);
    expect(guest.limits).toEqual([30, 100]);
  });

  it("honors env overrides", () => {
    process.env.INTEL_GUEST_DAILY_LIMIT = "7";
    const guest = intelQuotaPlan({ userId: null, guestId: "g-1" }, "203.0.113.8");
    expect(guest.limits[0]).toBe(7);
  });

  it("fails closed when the counter RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    const result = await consumeIntelRateLimit(new Request("https://example.test"), {
      userId: "user-1",
      guestId: null,
    });
    expect(result).toEqual({ allowed: false, status: 503, code: "intel_unavailable" });
    expect(rpc).toHaveBeenCalledWith(
      "consume_ai_quota_internal",
      expect.objectContaining({ p_window_seconds: 86_400 }),
    );
  });
});
