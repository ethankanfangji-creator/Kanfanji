import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveActiveShareForComments = vi.fn();
const listShareCommentsForLink = vi.fn();
const insertShareComment = vi.fn();
const consumeShareCommentRateLimit = vi.fn();
const emitShareCommentNotification = vi.fn();

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

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

vi.mock("@/lib/notifications/emit", () => ({
  emitShareCommentNotification: (...args: unknown[]) =>
    emitShareCommentNotification(...args),
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
      recipientLabel: null,
    });
    listShareCommentsForLink.mockResolvedValue([]);
    consumeShareCommentRateLimit.mockResolvedValue({ ok: true });
    insertShareComment.mockResolvedValue({
      id: "c1",
      authorLabel: "訪客",
      body: "nice light",
      createdAt: "2026-10-04T00:00:00.000Z",
      shareLinkId: "l1",
      parentId: null,
      authorKind: "guest",
      depth: 0,
    });
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

  it("forces authorLabel from named recipient codes", async () => {
    resolveActiveShareForComments.mockResolvedValue({
      ok: true,
      viewingId: "v1",
      shareLinkId: "l1",
      recipientLabel: "媽媽",
    });
    insertShareComment.mockResolvedValue({
      id: "c2",
      authorLabel: "媽媽",
      body: "ok",
      createdAt: "2026-10-04T00:00:00.000Z",
      shareLinkId: "l1",
      parentId: null,
      authorKind: "guest",
      depth: 0,
    });
    const response = await POST(
      new Request(`http://test/api/share/public/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "ok", authorLabel: "spoofed" }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(response.status).toBe(201);
    expect(insertShareComment).toHaveBeenCalledWith(
      expect.objectContaining({ authorLabel: "媽媽", body: "ok" }),
    );
  });

  it("accepts root notifyEmail opt-in and parentId replies on the same token link", async () => {
    const responseRoot = await POST(
      new Request(`http://test/api/share/public/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: "root",
          notifyEmail: "guest@example.com",
        }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(responseRoot.status).toBe(201);
    expect(insertShareComment).toHaveBeenCalledWith(
      expect.objectContaining({
        shareLinkId: "l1",
        parentId: null,
        notifyEmail: "guest@example.com",
      }),
    );

    insertShareComment.mockResolvedValue({
      id: "c2",
      viewingId: "v1",
      authorLabel: "訪客",
      body: "reply",
      createdAt: "2026-10-04T00:00:01.000Z",
      shareLinkId: "l1",
      parentId: "c1",
      authorKind: "guest",
      depth: 1,
    });

    const responseReply = await POST(
      new Request(`http://test/api/share/public/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: "reply",
          parentId: "c1",
          notifyEmail: "ignored-on-reply@example.com",
        }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(responseReply.status).toBe(201);
    expect(insertShareComment).toHaveBeenLastCalledWith(
      expect.objectContaining({
        parentId: "c1",
        notifyEmail: null,
        shareLinkId: "l1",
      }),
    );
    expect(emitShareCommentNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({
        parentId: "c1",
        shareToken: token,
        commentId: "c2",
      }),
    );
  });

  it("surfaces PARENT_MISMATCH when reply cannot inherit the link", async () => {
    insertShareComment.mockRejectedValue(new Error("PARENT_MISMATCH"));
    const response = await POST(
      new Request(`http://test/api/share/public/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "nope", parentId: "other-link-comment" }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "PARENT_MISMATCH" });
  });
});
