import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteOwnerShareComment } = vi.hoisted(() => ({
  deleteOwnerShareComment: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) },
  }),
}));
vi.mock("@/lib/share-access/comments", () => ({
  deleteOwnerShareComment,
}));

import { DELETE } from "./route";

describe("DELETE /api/share/comments/[id]", () => {
  beforeEach(() => {
    deleteOwnerShareComment.mockReset();
  });

  it("deletes an owned comment", async () => {
    deleteOwnerShareComment.mockResolvedValue(true);
    const response = await DELETE(new Request("http://test/api/share/comments/c1"), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(response.status).toBe(200);
    expect(deleteOwnerShareComment).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "c1",
    );
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("returns 404 when missing", async () => {
    deleteOwnerShareComment.mockResolvedValue(false);
    const response = await DELETE(new Request("http://test/api/share/comments/x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(response.status).toBe(404);
  });
});
