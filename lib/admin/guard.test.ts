import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

describe("requireAdmin", () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  it("returns 404 when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { requireAdmin } = await import("./guard");
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
  });

  it("returns 404 for a normal user", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: {}, user_metadata: {} } },
      error: null,
    });
    const { requireAdmin } = await import("./guard");
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
  });

  it("returns 404 when only user_metadata claims admin", async () => {
    getUser.mockResolvedValue({
      data: {
        user: { id: "u1", app_metadata: {}, user_metadata: { role: "admin" } },
      },
      error: null,
    });
    const { requireAdmin } = await import("./guard");
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
  });

  it("allows app_metadata.role admin", async () => {
    const user = { id: "u1", app_metadata: { role: "admin" }, user_metadata: {} };
    getUser.mockResolvedValue({ data: { user }, error: null });
    const { requireAdmin } = await import("./guard");
    await expect(requireAdmin()).resolves.toEqual({ user });
  });
});
