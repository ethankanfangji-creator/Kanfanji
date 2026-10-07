import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalThread,
  filterThreadsForAccount,
  listLocalThreads,
  LocalStoreFullError,
  threadVisibleToAccount,
  upsertLocalThread,
} from "./local-store";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if ((globalThis as { failSet?: boolean }).failSet) {
        const error = new DOMException("quota", "QuotaExceededError");
        throw error;
      }
      data.set(key, value);
    },
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
  };
}

describe("local thread store", () => {
  beforeEach(() => {
    (globalThis as { failSet?: boolean }).failSet = false;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: memoryStorage() },
    });
  });

  it("keeps more than 40 threads", () => {
    for (let i = 0; i < 60; i += 1) {
      createLocalThread(`Address ${i}`);
    }
    expect(listLocalThreads()).toHaveLength(60);
  });

  it("throws LocalStoreFullError when a retry still exceeds quota", () => {
    (globalThis as { failSet?: boolean }).failSet = true;
    expect(() => upsertLocalThread({
      id: "t1",
      address: "1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      report: null,
      metadata: null,
      ownerUserId: "user",
    })).toThrow(LocalStoreFullError);
  });
});

describe("filterThreadsForAccount", () => {
  const guest = { id: "g", ownerUserId: null };
  const alice = { id: "a", ownerUserId: "alice" };
  const bob = { id: "b", ownerUserId: "bob" };

  it("hides another account's leftover threads from a signed-in user", () => {
    expect(filterThreadsForAccount([guest, alice, bob], "bob").map((row) => row.id)).toEqual([
      "g",
      "b",
    ]);
  });

  it("hides owned threads while signed out", () => {
    expect(filterThreadsForAccount([guest, alice], null).map((row) => row.id)).toEqual(["g"]);
  });

  it("keeps unclaimed guest rows for the signed-in account", () => {
    expect(threadVisibleToAccount(guest, "bob")).toBe(true);
    expect(threadVisibleToAccount(alice, "bob")).toBe(false);
    expect(threadVisibleToAccount(bob, "bob")).toBe(true);
  });
});
