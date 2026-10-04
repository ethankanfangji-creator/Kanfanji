import { beforeEach, describe, expect, it, vi } from "vitest";

const { listOwnerShareCommentsAcrossViewings, getUser } = vi.hoisted(() => ({
  listOwnerShareCommentsAcrossViewings: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
  }),
}));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/share-access/comments", () => ({
  listOwnerShareCommentsAcrossViewings,
}));

import { GET } from "./route";

describe("GET /api/share/comments", () => {
  beforeEach(() => {
    listOwnerShareCommentsAcrossViewings.mockReset();
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
  });

  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(new Request("http://test/api/share/comments"));
    expect(response.status).toBe(401);
    expect(listOwnerShareCommentsAcrossViewings).not.toHaveBeenCalled();
  });

  it("returns owner comments across viewings and does not cache", async () => {
    listOwnerShareCommentsAcrossViewings.mockResolvedValue([
      {
        id: "c1",
        viewingId: "view-1",
        address: "Sukhumvit 24",
        authorLabel: "Alex",
        body: "Nice light",
        createdAt: "2026-10-02T00:00:00.000Z",
        shareLinkId: "link-1",
      },
    ]);
    const response = await GET(
      new Request("http://test/api/share/comments?q=Sukhumvit&viewingId=view-1"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(listOwnerShareCommentsAcrossViewings).toHaveBeenCalledWith(
      {},
      "owner-1",
      { q: "Sukhumvit", viewingId: "view-1", limit: 100 },
    );
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].body).toBe("Nice light");
    expect(body.items[0].address).toBe("Sukhumvit 24");
  });
});
