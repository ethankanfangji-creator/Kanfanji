import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const insertSingle = vi.fn();
const from = vi.fn();

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({ from }),
}));

vi.mock("./token-vault", () => ({
  encryptCommentNotifyEmail: (email: string) => `sealed:${email}`,
  decryptCommentNotifyEmail: (payload: string) =>
    payload.startsWith("sealed:") ? payload.slice(7) : payload,
}));

import {
  insertShareComment,
  normalizeCommentAuthor,
  normalizeCommentBody,
  normalizeNotifyEmail,
  optionalClientHash,
  shareCommentRateLimitKey,
} from "./comments";

describe("share report comments helpers", () => {
  it("normalizes optional author to guest fallback", () => {
    expect(normalizeCommentAuthor("  Ada  ", "訪客")).toBe("Ada");
    expect(normalizeCommentAuthor("", "訪客")).toBe("訪客");
    expect(normalizeCommentAuthor("x".repeat(80), "訪客").length).toBe(40);
  });

  it("rejects empty or oversized bodies", () => {
    expect(normalizeCommentBody("  hi  ")).toBe("hi");
    expect(normalizeCommentBody("")).toBeNull();
    expect(normalizeCommentBody("x".repeat(501))).toBeNull();
  });

  it("accepts only 64-char hex client hashes", () => {
    const ok = "a".repeat(64);
    expect(optionalClientHash(ok)).toBe(ok);
    expect(optionalClientHash("not-hex")).toBeNull();
  });

  it("builds a 64-char rate-limit key", () => {
    expect(shareCommentRateLimitKey("1.2.3.4", "t".repeat(64))).toMatch(/^[a-f0-9]{64}$/);
  });

  it("normalizes opt-in notify emails", () => {
    expect(normalizeNotifyEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(normalizeNotifyEmail("not-an-email")).toBeNull();
    expect(normalizeNotifyEmail(`${"a".repeat(250)}@x.com`)).toBeNull();
    expect(normalizeNotifyEmail("")).toBeNull();
  });
});

describe("insertShareComment threading privacy", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    insertSingle.mockReset();
    from.mockReset();
    from.mockImplementation(() => {
      const selectChain = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle,
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: insertSingle,
          }),
        }),
      };
      return selectChain;
    });
  });

  it("rejects replies whose parent is on another share link", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: "parent-1",
        viewing_id: "v1",
        share_link_id: "other-link",
        depth: 0,
        parent_id: null,
      },
      error: null,
    });

    await expect(
      insertShareComment({
        viewingId: "v1",
        shareLinkId: "link-a",
        authorLabel: "Guest",
        body: "cross-link reply",
        parentId: "parent-1",
      }),
    ).rejects.toThrow("PARENT_MISMATCH");
    expect(insertSingle).not.toHaveBeenCalled();
  });

  it("inherits same-link parent and never returns notify email in the DTO", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: "parent-1",
        viewing_id: "v1",
        share_link_id: "link-a",
        depth: 0,
        parent_id: null,
      },
      error: null,
    });
    insertSingle.mockResolvedValue({
      data: {
        id: "reply-1",
        viewing_id: "v1",
        share_link_id: "link-a",
        author_label: "Guest",
        body: "nested",
        created_at: "2026-10-09T00:00:00.000Z",
        parent_id: "parent-1",
        author_kind: "guest",
        depth: 1,
      },
      error: null,
    });

    const comment = await insertShareComment({
      viewingId: "v1",
      shareLinkId: "link-a",
      authorLabel: "Guest",
      body: "nested",
      parentId: "parent-1",
      notifyEmail: "hidden@example.com",
    });

    expect(comment).toMatchObject({
      id: "reply-1",
      shareLinkId: "link-a",
      parentId: "parent-1",
      authorKind: "guest",
      depth: 1,
    });
    expect(comment).not.toHaveProperty("notifyEmail");
    expect(comment).not.toHaveProperty("notify_email_ciphertext");
  });

  it("rejects replies past depth 8", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: "deep",
        viewing_id: "v1",
        share_link_id: "link-a",
        depth: 8,
        parent_id: "p7",
      },
      error: null,
    });

    await expect(
      insertShareComment({
        viewingId: "v1",
        shareLinkId: "link-a",
        authorLabel: "Guest",
        body: "too deep",
        parentId: "deep",
      }),
    ).rejects.toThrow("DEPTH_EXCEEDED");
  });
});
