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

vi.mock("./guest-identity", () => ({
  AI_GUEST_COOKIE: "kf_ai_guest",
  verifyGuestIdentityCookie: () => ({ guestId: "guest-1", deviceId: "device-1" }),
  createGuestIdentityCookie: () => null,
  guestCookieOptions: () => ({}),
}));

import { AI_CONSENT_VERSION } from "./config";
import { aiErrorResponse, authorizeAiRequest } from "./server";

const assertion = {
  consentVersion: AI_CONSENT_VERSION,
  consentSessionId: "sess",
  identityKind: "user" as const,
};

describe("authorizeAiRequest tier fallback", () => {
  beforeEach(() => {
    process.env.AI_QUOTA_HASH_SECRET = "quota-test-secret";
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    maybeSingle.mockReset();
    rpc.mockReset();
  });

  it("charges the free tier when the subscription lookup fails", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "nope" } });
    rpc.mockResolvedValue({ data: [{ allowed: true }], error: null });
    await authorizeAiRequest(new Request("https://example.test"), assertion);
    const keys = rpc.mock.calls[0][1].p_keys as string[];
    expect(keys[0].startsWith("free_l:")).toBe(true);
    expect(keys.join(" ")).not.toContain("pro_w:");
  });

  it("omits Retry-After for a lifetime quota", async () => {
    maybeSingle.mockResolvedValue({ data: { status: "inactive", manual_pro_until: null }, error: null });
    rpc.mockResolvedValue({
      data: [{ allowed: false, blocked_index: 1, retry_after_seconds: null }],
      error: null,
    });
    await expect(authorizeAiRequest(new Request("https://example.test"), assertion)).rejects.toMatchObject({
      code: "ai_quota_exceeded",
      status: 429,
    });
    try {
      await authorizeAiRequest(new Request("https://example.test"), assertion);
    } catch (error) {
      const response = aiErrorResponse(error);
      expect(response.headers.get("Retry-After")).toBeNull();
      expect(await response.json()).toMatchObject({
        tier: "free",
        limit: "tier",
        resetsAt: null,
      });
    }
  });
});
