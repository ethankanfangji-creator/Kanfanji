import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, authorizeAiRequest } = vi.hoisted(() => ({
  getUser: vi.fn(),
  authorizeAiRequest: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/ai-boundary/server-entry", () => ({
  AiInputError: class AiInputError extends Error {
    status: number;
    constructor(code: string, status = 400) {
      super(code);
      this.status = status;
    }
  },
  aiErrorResponse: (error: unknown) =>
    Response.json(
      { code: error instanceof Error ? error.message : "error" },
      { status: 400 },
    ),
  assertContentLength: () => undefined,
  authorizeAiRequest,
  resolveAiLocale: () => "zh-Hant",
  validateConsent: () => ({ version: "2026-09-15", sessionId: "s" }),
}));

vi.mock("@/lib/portfolio", () => ({
  askPortfolio: vi.fn(async () => ({
    answer: "ok",
    matchedIds: [],
    citations: [],
    suggestCompare: false,
  })),
  classifyAskQuestionThemes: () => ["decision"],
  parseRewriteHint: () => null,
  validateFactCards: () => [{ id: "1" }],
  validateHistoryTurns: () => [],
}));

vi.mock("@/lib/properties/signals", () => ({
  schedulePropertyAskThemes: vi.fn(),
}));

import { POST } from "./route";

beforeEach(() => {
  getUser.mockReset();
  authorizeAiRequest.mockReset();
  authorizeAiRequest.mockResolvedValue({
    applyCookie: (response: Response) => response,
  });
});

describe("POST /api/portfolio/ask", () => {
  it("rejects unsigned guests", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(
      new Request("https://example.test/api/portfolio/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "哪間比較好？",
          cards: [],
          consentVersion: "2026-09-15",
          consentSessionId: "s",
          identityKind: "guest",
        }),
      }),
    );
    expect(response.status).toBe(401);
    expect(authorizeAiRequest).not.toHaveBeenCalled();
  });

  it("allows signed-in users through auth", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    process.env.OPENAI_API_KEY = "test-key";
    const response = await POST(
      new Request("https://example.test/api/portfolio/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "哪間比較好？",
          cards: [
            {
              id: "1",
              address: "A",
              updatedAt: new Date().toISOString(),
              decisionStatus: null,
              price: null,
              layout: null,
              area: null,
              pros: [],
              risks: [],
              summary: null,
              notesExcerpt: "",
              fields: {},
              shareComments: [],
            },
          ],
          consentVersion: "2026-09-15",
          consentSessionId: "s",
          identityKind: "user",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(authorizeAiRequest).toHaveBeenCalled();
  });
});
