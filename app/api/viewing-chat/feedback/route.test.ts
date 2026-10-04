import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const maybeSingle = vi.fn();
const insert = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert,
    }),
  }),
}));

vi.mock("@/lib/ai-boundary/server-entry", () => ({
  assertContentLength: () => undefined,
  validateConsent: () => ({ ok: true }),
  authorizeAiRequest: async () => ({
    applyCookie: (response: Response) => response,
  }),
  aiErrorResponse: (error: unknown) => {
    const message = error instanceof Error ? error.message : "error";
    return Response.json({ error: message }, { status: 400 });
  },
  AiInputError: class AiInputError extends Error {
    constructor(public code: string) {
      super(code);
    }
  },
}));

describe("POST /api/viewing-chat/feedback", () => {
  beforeEach(() => {
    getUser.mockReset();
    maybeSingle.mockReset();
    insert.mockReset();
    insert.mockResolvedValue({ error: null });
  });

  it("rejects unauthenticated users", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/viewing-chat/feedback", {
        method: "POST",
        body: JSON.stringify({
          kind: "briefing",
          rating: "like",
          consentVersion: "1",
          consentSessionId: "s",
          identityKind: "user",
        }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("inserts feedback for an authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/viewing-chat/feedback", {
        method: "POST",
        body: JSON.stringify({
          kind: "report",
          rating: "dislike",
          reason: "太短",
          artifactExcerpt: "摘要",
          consentVersion: "1",
          consentSessionId: "s",
          identityKind: "user",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        kind: "report",
        rating: "dislike",
        reason: "太短",
        artifact_excerpt: "摘要",
      }),
    );
  });
});
