import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalThread,
  filterThreadsForAccount,
  getLocalThread,
  listLocalThreads,
  LocalStoreFullError,
  remintLocalThreadForCloud,
  threadVisibleToAccount,
  upsertLocalThread,
} from "./local-store";
import { isCloudThreadId } from "./thread-id";

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

  it("creates UUID v4 ids (never local_ timestamps)", () => {
    const thread = createLocalThread("99 Tyee Rd");
    expect(isCloudThreadId(thread.id)).toBe(true);
  });

  it("remints local_ ids so cloud sync can succeed", () => {
    upsertLocalThread({
      id: "local_1791611244192",
      address: "Unit 108, 369 Tyee Road",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      report: null,
      metadata: null,
    });
    const result = remintLocalThreadForCloud("local_1791611244192");
    expect(result.remapped).toBe(true);
    expect(isCloudThreadId(result.threadId)).toBe(true);
    expect(getLocalThread("local_1791611244192")).toBeNull();
    expect(getLocalThread(result.threadId)?.address).toBe("Unit 108, 369 Tyee Road");
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
