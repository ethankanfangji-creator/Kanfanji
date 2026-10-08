import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, extractTextFromPdfBase64 } = vi.hoisted(() => ({
  rpc: vi.fn(),
  extractTextFromPdfBase64: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));
vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));
vi.mock("@/lib/property-source/extract-pdf", () => ({
  extractTextFromPdfBase64,
}));

import { AI_CONSENT_VERSION } from "@/lib/ai-boundary/config";
import { POST } from "./route";

function formRequest(file: File) {
  const form = new FormData();
  form.set("file", file);
  form.set("consentVersion", AI_CONSENT_VERSION);
  form.set("consentSessionId", "session-1");
  form.set("identityKind", "guest");
  form.set("locale", "zh-Hant");
  return new Request("https://example.test/api/viewing-chat/read-file", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.4" },
    body: form,
  });
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.AI_GUEST_COOKIE_SECRET = "guest-cookie-test";
  process.env.AI_QUOTA_HASH_SECRET = "quota-hash-test";
  rpc.mockResolvedValue({
    data: [{ allowed: true, retry_after_seconds: 0 }],
    error: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_GUEST_COOKIE_SECRET;
  delete process.env.AI_QUOTA_HASH_SECRET;
});

describe("POST /api/viewing-chat/read-file", () => {
  it("extracts text files", async () => {
    const file = new File(["天花板有水漬"], "note.txt", { type: "text/plain" });
    const response = await POST(formRequest(file));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: "text",
      text: "天花板有水漬",
    });
  });

  it("extracts pdf via unpdf helper", async () => {
    extractTextFromPdfBase64.mockResolvedValue({
      ok: true,
      extractedText: "HOA dues $200",
      pageCount: 2,
    });
    const file = new File([new Uint8Array([1, 2, 3])], "hoa.pdf", {
      type: "application/pdf",
    });
    const response = await POST(formRequest(file));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: "pdf",
      text: "HOA dues $200",
      pageCount: 2,
    });
  });

  it("rejects unsupported types", async () => {
    const file = new File([new Uint8Array([1])], "x.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const response = await POST(formRequest(file));
    expect(response.status).toBe(415);
  });
});
