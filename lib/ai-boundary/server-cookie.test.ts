import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: vi.fn(async () => ({
      data: [{ allowed: false, blocked_index: 1, retry_after_seconds: null }],
      error: null,
    })),
  }),
}));

vi.mock("./guest-identity", () => ({
  AI_GUEST_COOKIE: "kf_ai_guest",
  verifyGuestIdentityCookie: () => null,
  createGuestIdentityCookie: () => ({
    identity: { guestId: "g", deviceId: "d" },
    value: "issued-cookie",
    maxAge: 60,
  }),
  guestCookieOptions: () => ({ httpOnly: true, path: "/", maxAge: 60 }),
}));

import { AI_CONSENT_VERSION } from "./config";
import { aiErrorResponse, authorizeAiRequest } from "./server";

describe("guest cookie on a blocked request", () => {
  beforeEach(() => {
    process.env.AI_QUOTA_HASH_SECRET = "quota-test-secret";
  });

  it("sets kf_ai_guest when a cookieless guest is rejected", async () => {
    await expect(
      authorizeAiRequest(new Request("https://example.test"), {
        consentVersion: AI_CONSENT_VERSION,
        consentSessionId: "sess",
        identityKind: "guest",
      }),
    ).rejects.toBeTruthy();
    try {
      await authorizeAiRequest(new Request("https://example.test"), {
        consentVersion: AI_CONSENT_VERSION,
        consentSessionId: "sess",
        identityKind: "guest",
      });
    } catch (error) {
      const response = aiErrorResponse(error);
      expect(response.status).toBe(429);
      expect(response.headers.get("set-cookie")).toContain("kf_ai_guest=issued-cookie");
    }
  });
});
