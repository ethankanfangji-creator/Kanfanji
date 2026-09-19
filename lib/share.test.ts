import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, rpc, createSignedUrls, maybeSingle } = vi.hoisted(() => {
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
});
