import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAccountTier } = vi.hoisted(() => ({
  getAccountTier: vi.fn(),
}));

vi.mock("@/lib/entitlement/tier", () => {
  class TierLookupError extends Error {
    constructor(message = "tier lookup failed") {
      super(message);
      this.name = "TierLookupError";
    }
  }
  return { getAccountTier, TierLookupError };
});

import { createViewingRow } from "./create-gate.server";

function admin(options: {
  existing?: { id: string } | null;
  count?: number;
  insertId?: string;
}) {
  return {
    rpc: vi.fn().mockResolvedValue({ error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: options.existing ?? null, error: null }),
          }),
          then: (
            resolve: (value: { count: number; error: null }) => unknown,
            reject?: (reason: unknown) => unknown,
          ) => Promise.resolve({ count: options.count ?? 0, error: null }).then(resolve, reject),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: options.insertId ?? "new-id" }, error: null }),
        }),
      }),
    }),
  };
}

const input = {
  id: "11111111-1111-4111-8111-111111111111",
  address: "1 Main",
  idempotencyKey: "chat:11111111-1111-4111-8111-111111111111",
};

describe("createViewingRow", () => {
  beforeEach(() => {
    getAccountTier.mockReset();
  });

  it("returns exists and does not look up the tier again", async () => {
    const result = await createViewingRow(
      admin({ existing: { id: "existing" } }) as never,
      "user-1",
      input,
    );
    expect(result.outcome).toBe("exists");
    expect(result.id).toBe("existing");
    expect(getAccountTier).not.toHaveBeenCalled();
  });

  it("blocks a free account that already has 3 rows", async () => {
    getAccountTier.mockResolvedValue("free");
    const result = await createViewingRow(admin({ count: 3 }) as never, "user-1", input);
    expect(result.outcome).toBe("limit_reached");
  });

  it("allows Pro without the free cap", async () => {
    getAccountTier.mockResolvedValue("pro");
    const result = await createViewingRow(admin({ count: 9 }) as never, "user-1", input);
    expect(result.outcome).toBe("created");
    expect(result.isPro).toBe(true);
  });

  it("treats a failed tier lookup as free", async () => {
    const { TierLookupError } = await import("@/lib/entitlement/tier");
    getAccountTier.mockRejectedValue(new TierLookupError("down"));
    const result = await createViewingRow(admin({ count: 3 }) as never, "user-1", input);
    expect(result.outcome).toBe("limit_reached");
    expect(result.isPro).toBe(false);
  });
});
