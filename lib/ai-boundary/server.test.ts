import { describe, expect, it, vi } from "vitest";
import { AI_CONSENT_VERSION } from "./config";
import { AiInputError } from "./validation";
import { aiErrorResponse, authorizeAiRequest } from "./server";

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
    },
  }),
}));

describe("AI public errors", () => {
  it("returns Retry-After for quota errors", async () => {
    const error = Object.assign(new AiInputError("ai_quota_exceeded", 429), {
      retryAfter: 37,
    });
    const response = aiErrorResponse(error);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
    expect(await response.json()).toEqual({
      error: "AI request could not be completed.",
      code: "ai_quota_exceeded",
    });
  });

  it("redacts upstream details and classifies timeouts", async () => {
    const response = aiErrorResponse(
      new DOMException("secret provider payload and API key", "TimeoutError"),
    );
    expect(response.status).toBe(504);
    const body = await response.text();
    expect(body).toContain("ai_upstream_timeout");
    expect(body).not.toContain("secret provider payload");
  });

  it("redacts other upstream failures", async () => {
    const response = aiErrorResponse(new Error("OpenAI internal request id abc123"));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "AI request could not be completed.",
      code: "ai_upstream_failed",
    });
  });
});

describe("authorizeAiRequest without a guest signing secret", () => {
  const originalGuest = process.env.AI_GUEST_COOKIE_SECRET;
  const originalService = process.env.SUPABASE_SERVICE_ROLE_KEY;

  it("returns 503 ai_identity_unavailable and does not name the missing secret", async () => {
    delete process.env.AI_GUEST_COOKIE_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const request = new Request("http://localhost/api/viewing-chat/turn");
    await expect(
      authorizeAiRequest(
        request,
        {
          consentVersion: AI_CONSENT_VERSION,
          consentSessionId: "sess-1",
          identityKind: "guest",
        },
        { consumeQuota: false },
      ),
    ).rejects.toMatchObject({ code: "ai_identity_unavailable", status: 503 });

    try {
      await authorizeAiRequest(
        request,
        {
          consentVersion: AI_CONSENT_VERSION,
          consentSessionId: "sess-1",
          identityKind: "guest",
        },
        { consumeQuota: false },
      );
    } catch (error) {
      const response = aiErrorResponse(error);
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.code).toBe("ai_identity_unavailable");
      expect(JSON.stringify(body)).not.toMatch(/AI_GUEST_COOKIE_SECRET|SERVICE_ROLE/);
    }

    if (originalGuest == null) delete process.env.AI_GUEST_COOKIE_SECRET;
    else process.env.AI_GUEST_COOKIE_SECRET = originalGuest;
    if (originalService == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalService;
  });
});
