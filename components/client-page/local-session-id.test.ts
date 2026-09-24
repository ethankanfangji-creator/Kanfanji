import { describe, expect, it, vi } from "vitest";
import {
  createStableLocalSessionId,
  ensureLocalSessionId,
  resolveExistingLocalSessionId,
} from "./local-session-id";

describe("local-session-id", () => {
  it("prefers in-memory draft session id", async () => {
    const getActiveDraft = vi.fn(async () => ({ localSessionId: "from-idb" }));
    await expect(
      resolveExistingLocalSessionId({
        draftSessionId: "mem",
        getActiveDraft,
      }),
    ).resolves.toBe("mem");
    expect(getActiveDraft).not.toHaveBeenCalled();
  });

  it("falls back to IDB localSessionId", async () => {
    await expect(
      resolveExistingLocalSessionId({
        draftSessionId: null,
        getActiveDraft: async () => ({ localSessionId: "idb-1" }),
      }),
    ).resolves.toBe("idb-1");
  });

  it("ensureLocalSessionId mints only when nothing exists", async () => {
    const setDraftSessionId = vi.fn();
    const id = await ensureLocalSessionId({
      draftSessionId: null,
      getActiveDraft: async () => null,
      createEntityId: () => "new-id",
      setDraftSessionId,
    });
    expect(id).toBe("new-id");
    expect(setDraftSessionId).toHaveBeenCalledWith("new-id");

    const existing = await ensureLocalSessionId({
      draftSessionId: "keep",
      getActiveDraft: async () => null,
      createEntityId: () => "new-id",
      setDraftSessionId,
    });
    expect(existing).toBe("keep");
  });

  it("createStableLocalSessionId always mints", async () => {
    const setDraftSessionId = vi.fn();
    await expect(
      createStableLocalSessionId({
        createEntityId: () => "x",
        setDraftSessionId,
      }),
    ).resolves.toBe("x");
  });
});
