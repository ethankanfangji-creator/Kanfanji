import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchViewingByShareTokenAdmin = vi.fn();
vi.mock("./server", () => ({
  fetchViewingByShareTokenAdmin: (...args: unknown[]) =>
    fetchViewingByShareTokenAdmin(...args),
}));

vi.mock("./token-vault", () => ({
  decryptShareToken: () => "tok",
}));

vi.mock("./crypto", async () => {
  const actual = await vi.importActual<typeof import("./crypto")>("./crypto");
  return {
    ...actual,
    isShareTokenFormat: (token: string) => token.length >= 32,
  };
});

import { getShareSaveState, saveShareForUser } from "./saves";

const TOKEN = "a".repeat(64);

function adminMock(handlers: {
  select?: () => Promise<{ data: unknown; error: null }>;
  insert?: () => Promise<{ error: null | { code?: string } }>;
}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: handlers.select ?? (async () => ({ data: null, error: null })),
          }),
        }),
      }),
      insert: handlers.insert ?? (async () => ({ error: null })),
    }),
  };
}

describe("share saves", () => {
  beforeEach(() => {
    fetchViewingByShareTokenAdmin.mockReset();
  });

  it("marks owner so the save button can hide", async () => {
    fetchViewingByShareTokenAdmin.mockResolvedValue({
      shareLink: { id: "link-1" },
      ownerId: "owner-1",
    });
    const state = await getShareSaveState(
      adminMock({}) as never,
      TOKEN,
      "owner-1",
    );
    expect(state).toEqual({
      ok: true,
      isOwner: true,
      saved: false,
      signedIn: true,
      shareLinkId: "link-1",
    });
  });

  it("rejects saving own link", async () => {
    fetchViewingByShareTokenAdmin.mockResolvedValue({
      shareLink: { id: "link-1" },
      ownerId: "owner-1",
    });
    const result = await saveShareForUser(
      adminMock({}) as never,
      TOKEN,
      "owner-1",
    );
    expect(result).toEqual({ ok: false, reason: "owner" });
  });

  it("saves for a non-owner", async () => {
    fetchViewingByShareTokenAdmin.mockResolvedValue({
      shareLink: { id: "link-1" },
      ownerId: "owner-1",
    });
    const result = await saveShareForUser(
      adminMock({
        select: async () => ({ data: null, error: null }),
        insert: async () => ({ error: null }),
      }) as never,
      TOKEN,
      "user-2",
    );
    expect(result).toEqual({ ok: true, already: false });
  });
});
