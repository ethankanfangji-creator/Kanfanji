import { beforeEach, describe, expect, it, vi } from "vitest";

const { maybeSingle } = vi.hoisted(() => ({ maybeSingle: vi.fn() }));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle }),
        }),
      }),
    }),
  }),
}));

import { resolveCompareShare } from "./share-server";

const invalid = { status: "invalid" as const };

describe("resolveCompareShare", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
  });

  it("returns legacy for a 64-hex token and the same invalid object otherwise", async () => {
    await expect(resolveCompareShare("a".repeat(64))).resolves.toEqual({ status: "legacy" });
    expect(maybeSingle).not.toHaveBeenCalled();

    maybeSingle.mockResolvedValue({ data: null, error: null });
    const missing = await resolveCompareShare("a".repeat(43));
    maybeSingle.mockResolvedValue({ data: null, error: { message: "nope" } });
    const errored = await resolveCompareShare("b".repeat(43));
    maybeSingle.mockResolvedValue({
      data: {
        snapshot: { version: 2 },
        expires_at: "2000-01-01T00:00:00.000Z",
        created_at: "1999-01-01T00:00:00.000Z",
        user_id: "u",
        status: "active",
      },
      error: null,
    });
    const expired = await resolveCompareShare("c".repeat(43));
    maybeSingle.mockResolvedValue({
      data: {
        snapshot: null,
        expires_at: "2099-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        user_id: "u",
        status: "active",
      },
      error: null,
    });
    const revoked = await resolveCompareShare("d".repeat(43));
    const garbage = await resolveCompareShare("not a token");

    expect(missing).toEqual(invalid);
    expect(errored).toEqual(invalid);
    expect(expired).toEqual(invalid);
    expect(revoked).toEqual(invalid);
    expect(garbage).toEqual(invalid);
    expect(missing).toEqual(errored);
    expect(errored).toEqual(expired);
    expect(expired).toEqual(revoked);
    expect(revoked).toEqual(garbage);
  });
});
