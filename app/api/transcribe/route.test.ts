import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, consumeAiQuota, transcription, upload, updates } = vi.hoisted(() => ({
  getUser: vi.fn(),
  consumeAiQuota: vi.fn(),
  transcription: vi.fn(),
  upload: vi.fn(async () => ({ error: null })),
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("openai", () => ({
  default: class {
    audio = { transcriptions: { create: transcription } };
  },
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from(table: string) {
      const viewingId = "11111111-1111-4111-8111-111111111111";
      const row =
        table === "viewings"
          ? { id: viewingId }
          : table === "viewing_card_templates"
            ? { id: "22222222-2222-4222-8222-222222222222" }
            : { id: "33333333-3333-4333-8333-333333333333" };
      const chain = {
        select: () => chain,
        eq: () => chain,
        upsert: () => chain,
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          return chain;
        },
        maybeSingle: async () => ({ data: row, error: null }),
        single: async () => ({ data: row, error: null }),
      };
      return chain;
    },
    storage: { from: () => ({ upload }) },
  }),
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

vi.mock("@/lib/entitlement/tier", () => ({
  getAccountTier: async () => "free",
}));

vi.mock("@/lib/ai-boundary/quota", () => ({
  consumeAiQuota,
}));

import { POST } from "./route";

const viewingId = "11111111-1111-4111-8111-111111111111";
const templateId = "22222222-2222-4222-8222-222222222222";

function form() {
  const body = new FormData();
  body.set("viewingId", viewingId);
  body.set("templateId", templateId);
  body.set("audio", new File([Uint8Array.from([1, 2, 3])], "voice.webm", { type: "audio/webm" }));
  return body;
}

beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
  process.env.OPENAI_API_KEY = "test-key";
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  consumeAiQuota.mockResolvedValue({ allowed: true, tier: "free" });
  transcription.mockResolvedValue({ text: "採光很好" });
});

describe("POST /api/transcribe", () => {
  it("returns 401 and does not call Whisper when logged out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(
      new Request("https://example.test/api/transcribe", { method: "POST", body: form() }),
    );
    expect(response.status).toBe(401);
    expect(transcription).not.toHaveBeenCalled();
    expect(consumeAiQuota).not.toHaveBeenCalled();
  });

  it("returns the existing quota payload and does not call Whisper when the quota is used up", async () => {
    consumeAiQuota.mockResolvedValue({
      allowed: false,
      code: "ai_quota_exceeded",
      tier: "free",
      limit: "tier",
      retryAfter: null,
      resetsAt: null,
    });
    const response = await POST(
      new Request("https://example.test/api/transcribe", { method: "POST", body: form() }),
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "AI request could not be completed.",
      code: "ai_quota_exceeded",
      tier: "free",
      limit: "tier",
      resetsAt: null,
    });
    expect(transcription).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("stores the audio path and the transcript without a monthly voice limit", async () => {
    const response = await POST(
      new Request("https://example.test/api/transcribe", { method: "POST", body: form() }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.transcript).toBe("採光很好");
    expect(body.voicePath).toMatch(
      /^user-1\/11111111-1111-4111-8111-111111111111\/audios\/33333333-3333-4333-8333-333333333333\//,
    );
    expect(body.voicePath).not.toMatch(/^https?:/);
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ voice_path: body.voicePath }),
        expect.objectContaining({ voice_transcript: "採光很好" }),
      ]),
    );
    expect(transcription).toHaveBeenCalledWith(
      expect.objectContaining({ model: "whisper-1" }),
      expect.anything(),
    );
  });
});
