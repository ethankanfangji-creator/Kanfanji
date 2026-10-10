import { beforeEach, describe, expect, it, vi } from "vitest";

const insertOwnerShareReply = vi.fn();
const getUser = vi.fn();
const emitShareCommentNotification = vi.fn();

vi.mock("@/lib/share-access/comments", () => ({
  insertOwnerShareReply: (...args: unknown[]) => insertOwnerShareReply(...args),
  normalizeCommentBody: (raw: unknown) =>
    typeof raw === "string" && raw.trim() ? raw.trim() : null,
}));

vi.mock("@/lib/notifications/emit", () => ({
  emitShareCommentNotification: (...args: unknown[]) =>
    emitShareCommentNotification(...args),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
  }),
}));

import { POST } from "./route";

describe("POST /api/share/comments/[id]/reply", () => {
  beforeEach(() => {
    insertOwnerShareReply.mockReset();
    getUser.mockReset();
    emitShareCommentNotification.mockReset();
  });

  it("requires auth", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(
      new Request("http://test/api/share/comments/c1/reply", {
        method: "POST",
        body: JSON.stringify({ body: "hi" }),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(response.status).toBe(401);
  });

  it("inserts an owner reply and notifies", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    insertOwnerShareReply.mockResolvedValue({
      id: "r1",
      viewingId: "v1",
      shareLinkId: "l1",
      authorLabel: "Owner",
      body: "Thanks",
      createdAt: "2026-01-01T00:00:00.000Z",
      parentId: "c1",
      authorKind: "owner",
      depth: 1,
    });
    const response = await POST(
      new Request("http://test/api/share/comments/c1/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Thanks" }),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(response.status).toBe(201);
    expect(insertOwnerShareReply).toHaveBeenCalled();
    expect(emitShareCommentNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        viewingId: "v1",
        parentId: "c1",
        commentId: "r1",
      }),
    );
  });
});
