import { beforeEach, describe, expect, it, vi } from "vitest";

const { maybeSingle, upsert } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle }),
        }),
        upsert,
      }),
    }),
  }),
}));

import {
  addressFactsCacheKey,
  getCachedPropertyFacts,
  placeFactsCacheKey,
  setCachedPropertyFacts,
} from "./cache";

const card = {
  region: "CA",
  identity: { formattedAddress: "1 Main" },
  meta: { assembledAt: "2026-09-27T00:00:00.000Z" },
};

beforeEach(() => {
  maybeSingle.mockReset();
  upsert.mockReset();
  upsert.mockResolvedValue({ error: null });
});

describe("property facts cache keys", () => {
  it("writes the address key and the place alias, and reads by place id", async () => {
    const addressKey = addressFactsCacheKey("1 Main St, Vancouver");
    const placeKey = placeFactsCacheKey("google", "ChIJplace");
    expect(addressKey).toMatch(/^facts:v1:[a-f0-9]{64}$/);
    expect(placeKey).toMatch(/^facts:v1:place:[a-f0-9]{64}$/);
    expect(placeKey).not.toContain("ChIJplace");

    maybeSingle.mockResolvedValueOnce({
      data: { payload: card, expires_at: new Date(Date.now() + 60_000).toISOString() },
      error: null,
    });
    const hit = await getCachedPropertyFacts("1 Main St, Vancouver", {
      placeId: "ChIJplace",
      placeSource: "google",
    });
    expect(hit).toEqual(card);

    await setCachedPropertyFacts("1 Main St, Vancouver", card as never, {
      placeId: "ChIJplace",
      placeSource: "google",
    });
    const rows = upsert.mock.calls[0]?.[0] as Array<{ cache_key: string }>;
    expect(rows.map((row) => row.cache_key).sort()).toEqual([addressKey, placeKey].sort());
  });

  it("does not return an expired row", async () => {
    maybeSingle.mockResolvedValue({
      data: { payload: card, expires_at: new Date(Date.now() - 1000).toISOString() },
      error: null,
    });
    const hit = await getCachedPropertyFacts("1 Main St, Vancouver", {
      placeId: "ChIJplace",
      placeSource: "google",
    });
    expect(hit).toBeNull();
  });
});
