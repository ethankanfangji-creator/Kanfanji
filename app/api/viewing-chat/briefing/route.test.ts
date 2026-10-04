import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeAiRequest,
  assemblePropertyFacts,
  generateAddressBriefing,
  BriefingGenerateError,
  isBriefingGenerateError,
} = vi.hoisted(() => {
  class BriefingGenerateError extends Error {
    code: string;
    status: number;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.name = "BriefingGenerateError";
      this.code = code;
      this.status = code === "openai_timeout" ? 504 : 502;
    }
  }
  function isBriefingGenerateError(error: unknown): error is BriefingGenerateError {
    if (!error || typeof error !== "object") return false;
    const row = error as { name?: unknown; code?: unknown; status?: unknown };
    return (
      row.name === "BriefingGenerateError" &&
      typeof row.code === "string" &&
      (row.status === 502 || row.status === 504)
    );
  }
  return {
    authorizeAiRequest: vi.fn(),
    assemblePropertyFacts: vi.fn(),
    generateAddressBriefing: vi.fn(),
    BriefingGenerateError,
    isBriefingGenerateError,
  };
});

vi.mock("@/lib/ai-boundary/server-entry", () => ({
  AiInputError: class AiInputError extends Error {
    code: string;
    status: number;
    constructor(code: string, status = 400) {
      super(code);
      this.code = code;
      this.status = status;
    }
  },
  aiErrorResponse: (error: unknown) => {
    const err = error as { code?: string; status?: number };
    return Response.json(
      { error: "AI request could not be completed.", code: err.code ?? "ai_upstream_failed" },
      { status: err.status ?? 502 },
    );
  },
  assertContentLength: () => undefined,
  authorizeAiRequest,
  resolveAiLocale: () => "en",
  validateConsent: () => ({
    consentVersion: "2026-09-15",
    consentSessionId: "s",
    identityKind: "user",
  }),
}));

vi.mock("@/lib/property-facts/orchestrator", () => ({
  assemblePropertyFacts,
}));

vi.mock("@/lib/viewing-chat/briefing-facts", () => ({
  extractBriefingFoundFacts: () => ({ facts: [], sourcesQueried: ["geocoder"] }),
}));

vi.mock("@/lib/viewing-chat/generate-briefing", () => ({
  BriefingGenerateError,
  isBriefingGenerateError,
  generateAddressBriefing,
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

import { AI_CONSENT_VERSION } from "@/lib/ai-boundary/config";
import { POST } from "./route";

function post(body: Record<string, unknown>) {
  return new Request("https://example.test/api/viewing-chat/briefing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authorizeAiRequest.mockReset();
  assemblePropertyFacts.mockReset();
  generateAddressBriefing.mockReset();
  authorizeAiRequest.mockResolvedValue({
    applyCookie: <T,>(response: T) => response,
  });
  assemblePropertyFacts.mockResolvedValue({});
  process.env.OPENAI_API_KEY = "test-key";
});

describe("POST /api/viewing-chat/briefing", () => {
  it("returns typed 502 instead of silent empty 200 on OpenAI connection failure", async () => {
    generateAddressBriefing.mockRejectedValue(
      new BriefingGenerateError("openai_connection", "Connection error."),
    );

    const response = await POST(
      post({
        address: "206 Clearview Drive, Port Moody, BC",
        locale: "zh-Hant",
        consentVersion: AI_CONSENT_VERSION,
        consentSessionId: "session",
        identityKind: "user",
      }),
    );

    expect(response.status).toBe(502);
    const body = (await response.json()) as { code?: string; briefing?: { summary?: string } };
    expect(body.code).toBe("openai_connection");
    expect(body.briefing?.summary ?? "").toBe("");
  });

  it("returns 504 for openai_timeout", async () => {
    generateAddressBriefing.mockRejectedValue(new BriefingGenerateError("openai_timeout"));

    const response = await POST(
      post({
        address: "206 Clearview Drive, Port Moody, BC",
        consentVersion: AI_CONSENT_VERSION,
        consentSessionId: "session",
        identityKind: "user",
      }),
    );

    expect(response.status).toBe(504);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("openai_timeout");
  });
});
