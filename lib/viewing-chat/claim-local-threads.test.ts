import { describe, expect, it } from "vitest";
import { claimLocalThreads, type ClaimThread } from "./claim-local-threads";

function threads(count: number): ClaimThread[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `t${index}`,
    updatedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    ownerUserId: null,
  }));
}

describe("claimLocalThreads", () => {
  it("uploads the newest rows until the free slots are gone", async () => {
    let created = 1;
    const list = threads(5);
    const result = await claimLocalThreads({
      threads: list,
      userId: "user-1",
      post: async () => {
        if (created >= 3) return "limit_reached";
        created += 1;
        return "created";
      },
    });
    expect(result.uploaded).toBe(2);
    expect(result.blocked).toBe(3);
    expect(list.every((thread) => thread.ownerUserId === "user-1")).toBe(true);
  });

  it("leaves unclaimed rows untouched after a network error", async () => {
    const list = threads(3);
    await claimLocalThreads({
      threads: list,
      userId: "user-1",
      post: async (thread) => (thread.id === "t1" ? "network" : "created"),
    });
    expect(list.filter((thread) => thread.ownerUserId == null).length).toBeGreaterThan(0);
  });
});
