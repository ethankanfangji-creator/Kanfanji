import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveActiveShareForComments = vi.fn();
const listShareCommentsForLink = vi.fn();
const insertShareComment = vi.fn();
const consumeShareCommentRateLimit = vi.fn();
const isUnlocked = vi.fn();

vi.mock("@/lib/share-access", () => ({
  isShareTokenFormat: (token: string) => /^[a-f0-9]{64}$/i.test(token),
}));

vi.mock("@/lib/share-access/comments", async () => {
  const actual = await vi.importActual<typeof import("@/lib/share-access/comments")>(
    "@/lib/share-access/comments",
  );
  return {
    ...actual,
    resolveActiveShareForComments: (...args: unknown[]) => resolveActiveShareForComments(...args),
    listShareCommentsForLink: (...args: unknown[]) => listShareCommentsForLink(...args),
    insertShareComment: (...args: unknown[]) => insertShareComment(...args),
    consumeShareCommentRateLimit: (...args: unknown[]) => consumeShareCommentRateLimit(...args),
  };
});

vi.mock("@/lib/share-access/cookie", () => ({
  shareUnlockCookieName: () => "share-unlock",
  verifyShareUnlockCookieValue: () => true,
}));

vi.mock("@/lib/share-access/server", () => ({
  fetchShareGateByTokenAdmin: vi.fn(async () => ({
    shareLink: { password_hash: null, access_version: 1, viewing_id: "v1", id: "l1" },
  })),
  getShareAccess: (row: { shareLink: unknown }) => row.shareLink,
}));

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

import { GET, POST } from "./route";

const token = "a".repeat(64);

describe("GET/POST /api/share/public/[token]/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveActiveShareForComments.mockResolvedValue({
      ok: true,
      viewingId: "v1",
      shareLinkId: "l1",
    });
    listShareCommentsForLink.mockResolvedValue([]);
    consumeShareCommentRateLimit.mockResolvedValue({ ok: true });
    insertShareComment.mockResolvedValue({
      id: "c1",
      authorLabel: "訪客",
      body: "nice light",
      createdAt: "2026-10-04T00:00:00.000Z",
      shareLinkId: "l1",
    });
    void isUnlocked;
  });

  it("lists comments for an active share", async () => {
    const response = await GET(new Request(`http://test/api/share/public/${token}/comments`), {
      params: Promise.resolve({ token }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.comments).toEqual([]);
  });

  it("rejects invalid comment bodies", async () => {
    const response = await POST(
      new Request(`http://test/api/share/public/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "" }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(response.status).toBe(400);
  });

  it("rate-limits comment posts", async () => {
    consumeShareCommentRateLimit.mockResolvedValue({ ok: false, retryAfterSec: 12 });
    const response = await POST(
      new Request(`http://test/api/share/public/${token}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "203.0.113.9",
        },
        body: JSON.stringify({ body: "hello" }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
  });

  it("creates a comment", async () => {
    const response = await POST(
      new Request(`http://test/api/share/public/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "nice light", authorLabel: "Ada" }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(response.status).toBe(201);
    expect(insertShareComment).toHaveBeenCalledWith(
      expect.objectContaining({
        viewingId: "v1",
        shareLinkId: "l1",
        authorLabel: "Ada",
        body: "nice light",
      }),
    );
  });
});
