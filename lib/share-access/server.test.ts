import { hashShareToken } from "./crypto";
import { describe, expect, it, vi } from "vitest";
import { fetchShareGateByTokenAdmin } from "./server";

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
