import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureOwnerShareLink, getOwnerShareLink, listOwnerShareLinks } = vi.hoisted(() => ({
  ensureOwnerShareLink: vi.fn(),
  getOwnerShareLink: vi.fn(),
  listOwnerShareLinks: vi.fn(),
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
}));

import { GET, POST } from "./route";

describe("POST /api/share/links", () => {
  beforeEach(() => {
    ensureOwnerShareLink.mockReset();
    getOwnerShareLink.mockReset();
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
  it("hides another user's viewing and does not cache", async () => {
    getOwnerShareLink.mockResolvedValue({ link: null, viewing: null, urlPath: "", needsRegenerate: false });
    const response = await GET(new Request("http://test/api/share/links?viewingId=view-1"));
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
