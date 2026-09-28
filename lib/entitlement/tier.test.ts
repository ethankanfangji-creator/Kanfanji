import { describe, expect, it, vi } from "vitest";
import { getAccountTier, TierLookupError } from "./tier";

function client(result: { data: unknown; error: { message: string } | null }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => result,
        }),
      }),
    }),
  };
}

describe("getAccountTier", () => {
  it("treats active, trialing, and future manual Pro as pro", async () => {
    const admin = client({ data: { status: "active", manual_pro_until: null }, error: null });
    await expect(getAccountTier(admin as never, "u")).resolves.toBe("pro");
    const trial = client({ data: { status: "trialing", manual_pro_until: null }, error: null });
    await expect(getAccountTier(trial as never, "u")).resolves.toBe("pro");
    const manual = client({
      data: { status: "inactive", manual_pro_until: "2099-01-01T00:00:00.000Z" },
      error: null,
    });
    await expect(getAccountTier(manual as never, "u")).resolves.toBe("pro");
  });

  it("treats a missing or expired row as free", async () => {
    const missing = client({ data: null, error: null });
    await expect(getAccountTier(missing as never, "u")).resolves.toBe("free");
    const expired = client({
      data: { status: "inactive", manual_pro_until: "2000-01-01T00:00:00.000Z" },
      error: null,
    });
    await expect(getAccountTier(expired as never, "u")).resolves.toBe("free");
  });

  it("throws when the subscription query fails", async () => {
    const broken = client({ data: null, error: { message: "denied" } });
    await expect(getAccountTier(broken as never, "u")).rejects.toBeInstanceOf(TierLookupError);
    expect(vi.fn()).not.toHaveBeenCalled();
  });
});
