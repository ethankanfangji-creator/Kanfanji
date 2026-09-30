import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimitForTests } from "@/lib/rate-limit";

const insert = vi.hoisted(() => vi.fn());

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "discussion_rooms") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "room-1", viewing_ids: ["11111111-1111-4111-8111-111111111111"] },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "viewing_cards") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "card-1", viewing_id: "11111111-1111-4111-8111-111111111111" },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        insert: (row: unknown) => {
          insert(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  }),
}));

import { POST } from "./route";

function post(index: number) {
  return POST(
    new Request("https://example.test/api/discussion-comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify({
        shareCode: "K7NP3Q",
        nickname: "家人",
        content: `留言 ${index}`,
        vote: "like",
        cardId: "33333333-3333-4333-8333-333333333333",
      }),
    }),
  );
}

beforeEach(() => {
  insert.mockClear();
  resetRateLimitForTests();
});

describe("POST /api/discussion-comments", () => {
  it("stores an anonymous comment and then rate limits the same address", async () => {
    const first = await post(1);
    expect(first.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ nickname: "家人", content: "留言 1", vote: "like" }),
    );
    for (let index = 2; index <= 8; index += 1) {
      expect((await post(index)).status).toBe(200);
    }
    const blocked = await post(9);
    expect(blocked.status).toBe(429);
    expect(insert).toHaveBeenCalledTimes(8);
  });
});
