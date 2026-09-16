import { beforeEach, describe, expect, it, vi } from "vitest";

const { transcription, completion } = vi.hoisted(() => ({
  transcription: vi.fn(),
  completion: vi.fn(),
}));
vi.mock("openai", () => ({
  default: class {
    audio = { transcriptions: { create: transcription } };
    chat = { completions: { create: completion } };
  },
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null }),
  }),
}));

import { AI_CONSENT_VERSION, AI_LIMITS } from "@/lib/ai-boundary/config";
import { POST } from "./route";

function form() {
  const data = new FormData();
  data.set("audio", new File(["audio"], "note.webm", { type: "audio/webm" }));
  data.set("durationSec", "1");
  data.set("questions", "[]");
  data.set("markers", "[]");
  data.set("openData", "null");
  data.set("propertyContext", "null");
  data.set("market", "CA");
  data.set("locale", "en");
  data.set("consentVersion", AI_CONSENT_VERSION);
  data.set("consentSessionId", "session-1");
  data.set("identityKind", "guest");
  return data;
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.AI_GUEST_COOKIE_SECRET = "guest-test";
  process.env.AI_QUOTA_HASH_SECRET = "quota-test";
  vi.clearAllMocks();
});

describe("POST /api/process-recording validation", () => {
  it("does not transcribe when consent is missing", async () => {
    const data = form();
    data.delete("consentVersion");
    const response = await POST(
      new Request("https://example.test/api/process-recording", { method: "POST", body: data }),
    );
    expect(response.status).toBe(403);
    expect(transcription).not.toHaveBeenCalled();
  });

  it("rejects non-allowlisted audio and malformed context", async () => {
    const mime = form();
    mime.set("audio", new File(["x"], "x.bin", { type: "application/octet-stream" }));
    expect(
      (
        await POST(
          new Request("https://example.test/api/process-recording", {
            method: "POST",
            body: mime,
          }),
        )
      ).status,
    ).toBe(415);

    const context = form();
    context.set("propertyContext", JSON.stringify({ tags: Array(41).fill("x") }));
    expect(
      (
        await POST(
          new Request("https://example.test/api/process-recording", {
            method: "POST",
            body: context,
          }),
        )
      ).status,
    ).toBe(400);
    expect(transcription).not.toHaveBeenCalled();
  });

  it("rejects declared oversized requests before parsing", async () => {
    const response = await POST(
      new Request("https://example.test/api/process-recording", {
        method: "POST",
        headers: { "content-length": String(AI_LIMITS.contentLengthBytes + 1) },
        body: form(),
      }),
    );
    expect(response.status).toBe(413);
    expect(transcription).not.toHaveBeenCalled();
  });
});
