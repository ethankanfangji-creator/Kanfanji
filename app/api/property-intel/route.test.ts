import { beforeEach, describe, expect, it, vi } from "vitest";

const { assemble, getCached, setCached, consume, getUser, updateEqUser, authorize } = vi.hoisted(() => ({
  assemble: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(),
  consume: vi.fn(),
  getUser: vi.fn(),
  updateEqUser: vi.fn(),
  authorize: vi.fn(),
}));

vi.mock("@/lib/ai-boundary/server", () => ({
  authorizeAiRequest: authorize,
  resolveGuestIdentity: async () => ({
    userId: "user-1",
    guest: { guestId: "guest-1", deviceId: "device-1" },
    applyCookie: (response: Response) => response,
  }),
  aiErrorResponse: (error: unknown) =>
    new Response(JSON.stringify({ code: error instanceof Error ? error.message : "err" }), {
      status: 400,
    }),
}));

vi.mock("@/lib/property-facts/orchestrator", () => ({
  assemblePropertyFacts: assemble,
}));

vi.mock("@/lib/property-facts/cache", () => ({
  getCachedPropertyFacts: getCached,
  setCachedPropertyFacts: setCached,
  addressFactsCacheKey: (address: string) => `facts:v1:${address}`,
  placeFactsCacheKey: (source: string, id: string) => `facts:v1:place:${source}:${id}`,
}));

vi.mock("@/lib/property-intel/rate-limit.server", () => ({
  consumeIntelRateLimit: consume,
}));

vi.mock("@/lib/property-facts/project", () => ({
  projectFactCardToIntel: () => ({
    location: { lat: null, lng: null },
    visuals: {},
    sources: [],
    compliance: {},
  }),
}));

vi.mock("@/lib/property-facts/report", () => ({
  projectFactCardToReport: () => ({ summary: "cached" }),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({
      update: () => ({
        eq: () => ({ eq: updateEqUser }),
      }),
    }),
  }),
}));

import { POST } from "./route";

const card = { region: "CA", identity: {}, meta: {} };

function request(body: Record<string, unknown>) {
  return new Request("https://example.test/api/property-intel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  assemble.mockReset();
  getCached.mockReset();
  setCached.mockReset();
  consume.mockReset();
  authorize.mockReset();
  getCached.mockResolvedValue(null);
  consume.mockResolvedValue({ allowed: true });
  assemble.mockResolvedValue(card);
  setCached.mockResolvedValue(undefined);
  updateEqUser.mockResolvedValue({ error: null });
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("POST /api/property-intel", () => {
  it("does not authorize AI quota and accepts a body without consent", async () => {
    const response = await POST(request({ address: "1 Main St" }));
    expect(response.status).toBe(200);
    expect(authorize).not.toHaveBeenCalled();
    expect(consume).toHaveBeenCalledOnce();
    expect(assemble).toHaveBeenCalledOnce();
  });

  it("returns a cache hit without rate limit or geocode", async () => {
    getCached.mockResolvedValue(card);
    const response = await POST(request({ address: "1 Main St", placeId: "p1", placeSource: "google" }));
    expect(response.status).toBe(200);
    expect(consume).not.toHaveBeenCalled();
    expect(assemble).not.toHaveBeenCalled();
  });

  it("maps rate limit and unavailable results", async () => {
    consume.mockResolvedValueOnce({ allowed: false, status: 429, code: "intel_rate_limited" });
    const limited = await POST(request({ address: "1 Main St" }));
    expect(limited.status).toBe(429);
    expect(assemble).not.toHaveBeenCalled();

    consume.mockResolvedValueOnce({ allowed: false, status: 503, code: "intel_unavailable" });
    const down = await POST(request({ address: "1 Main St" }));
    expect(down.status).toBe(503);
  });

  it("writes viewing metadata for the signed-in owner", async () => {
    const response = await POST(request({ address: "1 Main St", viewingId: "view-1" }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { persisted: boolean };
    expect(body.persisted).toBe(true);
    expect(updateEqUser).toHaveBeenCalledWith("user_id", "user-1");
  });
});
