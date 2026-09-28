import { beforeEach, describe, expect, it } from "vitest";
import { createLocalThread, listLocalThreads, LocalStoreFullError, upsertLocalThread } from "./local-store";

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
