import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateOwnerShareLink } = vi.hoisted(() => ({
  updateOwnerShareLink: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) },
  }),
}));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/share-access/server", () => ({ updateOwnerShareLink }));

import { PATCH } from "./route";

const link = {
  id: "link-1",
  viewingId: "view-1",
  token: "a".repeat(64),
  capability: "read" as const,
  status: "active" as const,
  expiresAt: null,
  passwordEnabled: false,
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
  revokedAt: null,
  lastResolvedAt: null,
  accessVersion: 1,
};

describe("PATCH /api/share/links/:linkId", () => {
  beforeEach(() => {
    updateOwnerShareLink.mockReset();
    updateOwnerShareLink.mockResolvedValue(link);
  });

  it("keeps omitted fields omitted", async () => {
    const response = await PATCH(
      new Request("http://test/api/share/links/link-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt: "2026-10-01T00:00:00.000Z" }),
      }),
      { params: Promise.resolve({ linkId: "link-1" }) },
    );

    expect(response.status).toBe(200);
    expect(updateOwnerShareLink).toHaveBeenCalledWith(
      {},
      "owner-1",
      "link-1",
      { expiresAt: "2026-10-01T00:00:00.000Z" },
    );
  });

  it("passes null explicitly to clear a field", async () => {
    await PATCH(
      new Request("http://test/api/share/links/link-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: null }),
      }),
      { params: Promise.resolve({ linkId: "link-1" }) },
    );

    expect(updateOwnerShareLink).toHaveBeenCalledWith(
      {},
      "owner-1",
      "link-1",
      { password: null },
    );
  });
});
