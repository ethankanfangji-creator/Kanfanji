import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, rpc, createSignedUrls, maybeSingle, builder } = vi.hoisted(() => {
  const rpc = vi.fn();
  const createSignedUrls = vi.fn();
  const maybeSingle = vi.fn();
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle,
    update: vi.fn(() => builder),
  };
  return {
    rpc,
    createSignedUrls,
    maybeSingle,
    builder,
    admin: {
      rpc,
      from: vi.fn(() => builder),
      storage: {
        from: vi.fn(() => ({ createSignedUrls })),
      },
    },
  };
});

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => admin,
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
}));

import { resolvePublicShare } from "./share";

const token = "a".repeat(64);
const link = {
  id: "link-1",
  viewing_id: "view-1",
  token,
  capability: "read",
  status: "active",
  expires_at: null,
  password_hash: null,
  access_version: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  revoked_at: null,
  last_resolved_at: null,
  published_snapshot: {
    version: 1,
    title: "Summary",
    address: "Address",
    updatedAt: null,
    decisionSummary: {
      version: 1,
      address: "Address",
      viewingAt: "",
      unitLabel: "",
      priceLabel: "",
      layoutLabel: "",
      listingUrl: "",
      setupNotes: "",
      overallRating: null,
      pros: [],
      risks: [],
      facts: [],
      followUps: [],
      actionItems: [],
      photos: [{ id: "photo-1", url: "", tag: "", note: "", selected: true }],
      disclaimer: "",
      generatedAt: "2026-01-01T00:00:00Z",
    },
    publishedAt: "2026-01-01T00:00:00Z",
  },
  media_manifest: [
    { id: "photo-1", path: "owner-1/view-1/photos/photo-1.jpg" },
  ],
};

describe("public share race hardening", () => {
  beforeEach(() => {
    rpc.mockReset();
    createSignedUrls.mockReset();
    maybeSingle.mockReset();
    admin.from.mockReset();
    admin.from.mockImplementation(() => builder);
    maybeSingle.mockResolvedValue({ data: link, error: null });
    createSignedUrls.mockResolvedValue({
      data: [{ signedUrl: "https://signed.example/private" }],
      error: null,
    });
  });

  it("does not release signed content when access changes during signing", async () => {
    rpc
      .mockResolvedValueOnce({
        data: { shareLink: link, ownerId: "owner-1" },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });

    const result = await resolvePublicShare(token, { unlocked: true });

    expect(createSignedUrls).toHaveBeenCalledOnce();
    expect(result.status).not.toBe("active");
    expect(JSON.stringify(result)).not.toContain("signed.example");
  });

  it("does not hydrate unpublished live map coords into a frozen v3 snapshot", async () => {
    const v3Link = {
      ...link,
      published_snapshot: {
        version: 3,
        kind: "chat_report",
        title: "看房報告",
        address: "2143 Spring St, Port Moody, BC",
        publishedAt: "2026-10-04T00:00:00Z",
        reportGeneratedAt: "2026-10-04T00:00:00Z",
        summary: "Quiet street",
        pros: [],
        risks: [],
      },
      media_manifest: [] as Array<{ id: string; path: string }>,
    };
    maybeSingle.mockResolvedValue({ data: v3Link, error: null });
    rpc.mockResolvedValue({
      data: { shareLink: v3Link, ownerId: "owner-1" },
      error: null,
    });
    admin.from.mockImplementation((table: string) => {
      if (table === "viewings") {
        const viewingBuilder = {
          select: vi.fn(() => viewingBuilder),
          eq: vi.fn(() => viewingBuilder),
          maybeSingle: vi.fn(async () => ({
            data: {
              chat_state: {
                sitePin: { lat: 49.2815, lng: -122.8512, source: "map" },
              },
              property: { lat: 49.28, lng: -122.85 },
            },
            error: null,
          })),
        };
        return viewingBuilder;
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle,
            update: vi.fn(() => ({
              eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        })),
      };
    });

    const result = await resolvePublicShare(token);

    expect(result.status).toBe("active");
    expect(JSON.stringify(result)).not.toContain("49.2815");
    expect(JSON.stringify(result)).not.toContain("-122.8512");
    if (result.status === "active") {
      expect(result.chatReport).toMatchObject({
        version: 3,
        address: "2143 Spring St, Port Moody, BC",
      });
      expect(result.chatReport).not.toHaveProperty("lat");
      expect(result.chatReport).not.toHaveProperty("lng");
    }
    expect(admin.from.mock.calls.some(([table]) => table === "viewings")).toBe(false);
  });
});
