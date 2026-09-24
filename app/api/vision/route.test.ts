import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { completion, rpc } = vi.hoisted(() => ({
  completion: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: completion } };
  },
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import { AI_CONSENT_VERSION } from "@/lib/ai-boundary/config";
import { POST } from "./route";

function body(overrides?: Record<string, unknown>) {
  return {
    base64: "data:image/jpeg;base64,AAAA",
    tag: "window",
    locale: "en",
    market: "CA",
    mediaId: "media-1",
    consentVersion: AI_CONSENT_VERSION,
    consentSessionId: "session-1",
    identityKind: "guest",
    ...overrides,
  };
}

function request(payload: Record<string, unknown>) {
  return new Request("https://example.test/api/vision", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.4" },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.AI_GUEST_COOKIE_SECRET = "guest-cookie-test";
  process.env.AI_QUOTA_HASH_SECRET = "quota-hash-test";
  rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });
  completion.mockResolvedValue({
    choices: [{ message: { content: "Ask when the window seal was replaced?" } }],
  });
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_GUEST_COOKIE_SECRET;
  delete process.env.AI_QUOTA_HASH_SECRET;
});

describe("POST /api/vision AI boundary", () => {
  it("makes no provider or quota request without consent", async () => {
    const response = await POST(request(body({ consentVersion: undefined })));
    expect(response.status).toBe(403);
    expect(completion).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed MIME/base64 before provider access", async () => {
    const response = await POST(request(body({ base64: "data:image/gif;base64,AAAA" })));
    expect(response.status).toBe(415);
    expect(completion).not.toHaveBeenCalled();
  });

  it("returns Retry-After when the atomic quota denies", async () => {
    rpc.mockResolvedValue({
      data: [{ allowed: false, retry_after_seconds: 91 }],
      error: null,
    });
    const response = await POST(request(body()));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("91");
    expect(completion).not.toHaveBeenCalled();
  });

  it("issues an HTTP-only guest identity and returns stable job id", async () => {
    const response = await POST(request(body()));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("kf_ai_guest=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(await response.json()).toMatchObject({ jobId: "media-1" });
  });

  it("embeds English output-language lock in the vision prompt", async () => {
    await POST(request(body({ locale: "en" })));
    expect(completion).toHaveBeenCalled();
    const messages = completion.mock.calls[0]?.[0]?.messages as Array<{
      role: string;
      content: Array<{ type: string; text?: string }> | string;
    }>;
    const user = messages?.find((m) => m.role === "user");
    const textPart = Array.isArray(user?.content)
      ? user.content.find((p) => p.type === "text")?.text ?? ""
      : String(user?.content ?? "");
    expect(textPart).toMatch(/Output language \(mandatory\)/);
    expect(textPart).toMatch(/English/);
  });

  it("redacts upstream timeout details", async () => {
    completion.mockRejectedValue(
      new DOMException("provider secret request-id=abc", "TimeoutError"),
    );
    const response = await POST(request(body()));
    expect(response.status).toBe(504);
    const text = await response.text();
    expect(text).toContain("ai_upstream_timeout");
    expect(text).not.toContain("request-id=abc");
  });
});
