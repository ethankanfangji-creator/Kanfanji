import { beforeEach, describe, expect, it, vi } from "vitest";

const closeAllOwnerShareLinksForViewing = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/share-access/server", () => ({
  closeAllOwnerShareLinksForViewing: (...args: unknown[]) =>
    closeAllOwnerShareLinksForViewing(...args),
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({ admin: true }),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
  }),
}));

import { POST } from "./route";

describe("POST /api/share/links/close-all", () => {
  beforeEach(() => {
    closeAllOwnerShareLinksForViewing.mockReset();
    getUser.mockReset();
  });

  it("requires auth", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(
      new Request("http://test/api/share/links/close-all", {
        method: "POST",
        body: JSON.stringify({ viewingId: "v1" }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("closes all open links for a viewing", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    closeAllOwnerShareLinksForViewing.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const response = await POST(
      new Request("http://test/api/share/links/close-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewingId: "v1" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(closeAllOwnerShareLinksForViewing).toHaveBeenCalledWith(
      { admin: true },
      "u1",
      "v1",
    );
    const body = await response.json();
    expect(body.closedCount).toBe(2);
  });
});
