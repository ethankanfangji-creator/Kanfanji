import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computePropertySignals,
  mergeThemeCounts,
  normalizeThemeCounts,
  recordPropertyAskThemes,
  refreshPropertySignals,
} from "./signals";

describe("theme count helpers", () => {
  it("normalizes and merges theme tags", () => {
    expect(normalizeThemeCounts({ budget: 2, nope: 9, risk: "3" })).toEqual({
      budget: 2,
      risk: 3,
    });
    expect(mergeThemeCounts({ budget: 1 }, ["budget", "layout", "budget"])).toEqual({
      budget: 3,
      layout: 1,
    });
  });
});

describe("computePropertySignals", () => {
  it("aggregates viewers and decision statuses and keeps ask extras", () => {
    const snap = computePropertySignals(
      "prop-1",
      [
        {
          user_id: "u1",
          chat_state: { decisionStatus: "liked" },
          updated_at: "2026-10-01T00:00:00.000Z",
        },
        {
          user_id: "u1",
          chat_state: { decisionStatus: "shortlist" },
          updated_at: "2026-10-02T00:00:00.000Z",
        },
        {
          user_id: "u2",
          chat_state: { decisionStatus: "passed" },
          updated_at: "2026-10-03T00:00:00.000Z",
        },
        {
          user_id: "u3",
          chat_state: null,
          updated_at: "2026-09-01T00:00:00.000Z",
        },
      ],
      {
        theme_counts: { budget: 2 },
        ask_hit_count: 4,
        last_ask_at: "2026-10-04T00:00:00.000Z",
        now: "2026-10-05T00:00:00.000Z",
      },
    );

    expect(snap).toMatchObject({
      property_id: "prop-1",
      viewing_count: 4,
      unique_viewer_count: 3,
      liked_count: 1,
      shortlist_count: 1,
      passed_count: 1,
      revisit_count: 0,
      decision_set_count: 3,
      theme_counts: { budget: 2 },
      ask_hit_count: 4,
      last_ask_at: "2026-10-04T00:00:00.000Z",
      last_viewing_at: "2026-10-03T00:00:00.000Z",
      refreshed_at: "2026-10-05T00:00:00.000Z",
    });
  });

  it("ignores invalid decision statuses", () => {
    const snap = computePropertySignals("prop-1", [
      { user_id: "u1", chat_state: { decisionStatus: "damp" } },
    ]);
    expect(snap.decision_set_count).toBe(0);
    expect(snap.viewing_count).toBe(1);
    expect(snap.theme_counts).toEqual({});
  });
});

describe("refreshPropertySignals", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upserts computed snapshot and preserves ask themes", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "viewings") {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  {
                    user_id: "u1",
                    chat_state: { decisionStatus: "liked" },
                    updated_at: "2026-10-01T00:00:00.000Z",
                    created_at: "2026-10-01T00:00:00.000Z",
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  theme_counts: { risk: 2 },
                  ask_hit_count: 3,
                  last_ask_at: "2026-10-02T00:00:00.000Z",
                },
                error: null,
              }),
            }),
          }),
          upsert,
          delete: () => ({ eq: async () => ({ error: null }) }),
        };
      }),
    };

    const snap = await refreshPropertySignals(admin as never, "prop-1");
    expect(snap?.viewing_count).toBe(1);
    expect(snap?.liked_count).toBe(1);
    expect(snap?.theme_counts).toEqual({ risk: 2 });
    expect(snap?.ask_hit_count).toBe(3);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        property_id: "prop-1",
        theme_counts: { risk: 2 },
        ask_hit_count: 3,
      }),
      { onConflict: "property_id" },
    );
  });

  it("keeps ask-only rows when no viewings remain", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "viewings") {
          return {
            select: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  theme_counts: { budget: 1 },
                  ask_hit_count: 1,
                  last_ask_at: "2026-10-02T00:00:00.000Z",
                },
                error: null,
              }),
            }),
          }),
          upsert,
          delete: () => ({
            eq: async () => {
              throw new Error("should not delete ask-only row");
            },
          }),
        };
      }),
    };

    const snap = await refreshPropertySignals(admin as never, "prop-1");
    expect(snap?.viewing_count).toBe(0);
    expect(snap?.ask_hit_count).toBe(1);
    expect(upsert).toHaveBeenCalled();
  });

  it("soft-fails to null", async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: "down" } }),
            then: (
              resolve: (value: { data: null; error: { message: string } }) => unknown,
            ) => resolve({ data: null, error: { message: "down" } }),
          }),
        }),
      }),
    };
    await expect(refreshPropertySignals(admin as never, "prop-1")).resolves.toBeNull();
  });
});

describe("recordPropertyAskThemes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps viewing ids to property ids and bumps theme counts", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "viewings") {
          return {
            select: (cols: string) => {
              if (cols === "id, property_id") {
                return {
                  in: async () => ({
                    data: [
                      { id: "v1", property_id: "p1" },
                      { id: "v2", property_id: "p1" },
                      { id: "v3", property_id: "p2" },
                    ],
                    error: null,
                  }),
                };
              }
              return {
                eq: async () => ({
                  data: [
                    {
                      user_id: "u1",
                      chat_state: { decisionStatus: "liked" },
                      updated_at: "2026-10-01T00:00:00.000Z",
                      created_at: "2026-10-01T00:00:00.000Z",
                    },
                  ],
                  error: null,
                }),
              };
            },
          };
        }
        // property_signals
        let loadCount = 0;
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                loadCount += 1;
                // First load in refresh (ask extras), second load after refresh for bump
                if (loadCount % 2 === 1) {
                  return {
                    data: {
                      theme_counts: {},
                      ask_hit_count: 0,
                      last_ask_at: null,
                    },
                    error: null,
                  };
                }
                return {
                  data: {
                    viewing_count: 1,
                    unique_viewer_count: 1,
                    liked_count: 1,
                    shortlist_count: 0,
                    passed_count: 0,
                    revisit_count: 0,
                    decision_set_count: 1,
                    theme_counts: {},
                    ask_hit_count: 0,
                    last_ask_at: null,
                    last_viewing_at: "2026-10-01T00:00:00.000Z",
                  },
                  error: null,
                };
              },
            }),
          }),
          upsert,
          delete: () => ({ eq: async () => ({ error: null }) }),
        };
      }),
    };

    const n = await recordPropertyAskThemes(admin as never, {
      viewingIds: ["v1", "v2", "v3"],
      themes: ["budget", "risk"],
    });
    expect(n).toBe(2);
    expect(upsert).toHaveBeenCalled();
    const themeUpserts = upsert.mock.calls
      .map((call) => call[0])
      .filter((row) => row.ask_hit_count === 1);
    expect(themeUpserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property_id: "p1",
          theme_counts: { budget: 1, risk: 1 },
          ask_hit_count: 1,
        }),
        expect.objectContaining({
          property_id: "p2",
          theme_counts: { budget: 1, risk: 1 },
          ask_hit_count: 1,
        }),
      ]),
    );
  });
});
