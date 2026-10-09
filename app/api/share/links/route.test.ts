import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ensureOwnerShareLink,
  getOwnerShareLink,
  listOwnerShareLinks,
  listOwnerShareLinksAcrossViewings,
} = vi.hoisted(() => ({
  ensureOwnerShareLink: vi.fn(),
  getOwnerShareLink: vi.fn(),
  listOwnerShareLinks: vi.fn(),
  listOwnerShareLinksAcrossViewings: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) },
  }),
}));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/share-access/server", () => ({
  ensureOwnerShareLink,
  getOwnerShareLink,
  listOwnerShareLinks,
  listOwnerShareLinksAcrossViewings,
}));

import { GET, POST } from "./route";

describe("POST /api/share/links", () => {
  beforeEach(() => {
    ensureOwnerShareLink.mockReset();
    getOwnerShareLink.mockReset();
    listOwnerShareLinks.mockReset();
    listOwnerShareLinksAcrossViewings.mockReset();
  });

  it("creates a link", async () => {
    ensureOwnerShareLink.mockResolvedValue({
      link: { id: "link-1", expiresAt: "2026-10-28T00:00:00.000Z" },
      urlPath: "/s/secret",
    });
    const response = await POST(
      new Request("http://test/api/share/links", {
        method: "POST",
        body: JSON.stringify({ viewingId: "view-1" }),
      }),
    );
    expect(response.status).toBe(201);
    expect(ensureOwnerShareLink.mock.calls[0]?.[3]).toEqual({});
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("token");
    expect(body.urlPath).toBe("/s/secret");
  });

  it("returns 503 when the key is missing", async () => {
    ensureOwnerShareLink.mockRejectedValue(new Error("SHARE_UNAVAILABLE"));
    const response = await POST(
      new Request("http://test/api/share/links", {
        method: "POST",
        body: JSON.stringify({ viewingId: "view-1" }),
      }),
    );
    expect(response.status).toBe(503);
  });

  it("returns 429 on the rate limit", async () => {
    ensureOwnerShareLink.mockRejectedValue(new Error("SHARE_RATE_LIMITED"));
    const response = await POST(
      new Request("http://test/api/share/links", {
        method: "POST",
        body: JSON.stringify({ viewingId: "view-1" }),
      }),
    );
    expect(response.status).toBe(429);
  });
});

describe("GET /api/share/links", () => {
  beforeEach(() => {
    getOwnerShareLink.mockReset();
    listOwnerShareLinks.mockReset();
    listOwnerShareLinksAcrossViewings.mockReset();
  });

  it("hides another user's viewing and does not cache", async () => {
    getOwnerShareLink.mockResolvedValue({
      link: null,
      viewing: null,
      urlPath: "",
      needsRegenerate: false,
    });
    const response = await GET(
      new Request("http://test/api/share/links?viewingId=view-1"),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("lists owner links across viewings without raw tokens", async () => {
    listOwnerShareLinksAcrossViewings.mockResolvedValue([
      {
        id: "link-1",
        viewingId: "view-1",
        address: "Sukhumvit 24",
        capability: "read",
        status: "active",
        expiresAt: null,
        passwordEnabled: false,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        revokedAt: null,
        closedAt: null,
        lastResolvedAt: null,
        accessVersion: 1,
        urlPath: "/s/abc",
        needsRegenerate: false,
        lat: null,
        lng: null,
      },
    ]);
    const response = await GET(
      new Request("http://test/api/share/links?status=open&q=Sukhumvit"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(listOwnerShareLinksAcrossViewings).toHaveBeenCalledWith(
      {},
      "owner-1",
      { status: "open", q: "Sukhumvit", limit: 100 },
    );
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].address).toBe("Sukhumvit 24");
    expect(JSON.stringify(body)).not.toContain('"token"');
  });

  it("defaults hub list status to open", async () => {
    listOwnerShareLinksAcrossViewings.mockResolvedValue([]);
    await GET(new Request("http://test/api/share/links"));
    expect(listOwnerShareLinksAcrossViewings.mock.calls[0]?.[2]).toMatchObject({
      status: "open",
    });
  });
});
