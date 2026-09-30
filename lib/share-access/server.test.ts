import { hashShareToken } from "./crypto";
import { describe, expect, it, vi } from "vitest";
import { fetchShareGateByTokenAdmin, rotateOwnerShareLink } from "./server";

describe("share password gate lookup", () => {
  it("looks up the token hash and does not select the published snapshot", async () => {
    const token = "a".repeat(64);
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "link-1",
        status: "active",
        password_hash: "scrypt$salt$hash",
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn((columns: string) => {
      void columns;
      return { eq };
    });
    const admin = { from: vi.fn(() => ({ select })) };

    await expect(fetchShareGateByTokenAdmin(admin as never, token)).resolves.toBeTruthy();
    expect(select.mock.calls[0][0]).not.toContain("published_snapshot");
    expect(select.mock.calls[0][0]).not.toMatch(/(^|, )token(,|$)/);
    expect(eq).toHaveBeenCalledWith("token_hash", hashShareToken(token));
  });
});

describe("share password gate lookup", () => {
  it("does not select the published snapshot before unlock", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "link-1",
        token: "a".repeat(64),
        status: "active",
        password_hash: "scrypt$salt$hash",
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn((columns: string) => {
      void columns;
      return { eq };
    });
    const admin = { from: vi.fn(() => ({ select })) };

    await expect(
      fetchShareGateByTokenAdmin(admin as never, "a".repeat(64)),
    ).resolves.toBeTruthy();
    expect(select).toHaveBeenCalledOnce();
    expect(select.mock.calls[0][0]).not.toContain("published_snapshot");
    expect(select.mock.calls[0][0]).not.toContain("media_manifest");
  });
});

describe("rotateOwnerShareLink", () => {
  it("does not replace the row when the report snapshot is not ready", async () => {
    process.env.SHARE_TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
    const rpc = vi.fn();
    const row = {
      id: "link-1",
      viewing_id: "view-1",
      status: "active",
      token: null,
      token_ciphertext: "v1.iv.ct",
      access_version: 1,
      expires_at: "2026-10-28T00:00:00.000Z",
      password_hash: null,
      created_at: "2026-09-28T00:00:00.000Z",
      updated_at: "2026-09-28T00:00:00.000Z",
      revoked_at: null,
      last_resolved_at: null,
    };
    const viewing = {
      id: "view-1",
      user_id: "owner-1",
      address: "1 Main",
      chat_state: { v: 1 },
      report: null,
      photo_urls: [],
      updated_at: "2026-09-28T00:00:00.000Z",
    };
    const admin = {
      rpc,
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: viewing, error: null }) }),
            maybeSingle: async () => ({
              data: table === "share_links" ? row : viewing,
              error: null,
            }),
          }),
        }),
      }),
    };
    await expect(rotateOwnerShareLink(admin as never, "owner-1", "link-1")).rejects.toThrow(
      /SUPABASE_SERVICE_ROLE_KEY|SHARE_/,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
