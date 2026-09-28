import { describe, expect, it } from "vitest";
import { syncWithRetry } from "./cloud-sync";

describe("syncWithRetry", () => {
  it("becomes failed after three unsuccessful puts", async () => {
    let calls = 0;
    const state = await syncWithRetry({
      put: async () => {
        calls += 1;
        return { status: 500 };
      },
      sleep: async () => {},
    });
    expect(calls).toBe(3);
    expect(state).toBe("failed");
  });

  it("returns blocked_limit on 402 without extra retries", async () => {
    let calls = 0;
    const state = await syncWithRetry({
      put: async () => {
        calls += 1;
        return { status: 402 };
      },
      sleep: async () => {},
    });
    expect(calls).toBe(1);
    expect(state).toBe("blocked_limit");
  });

  it("returns synced on the first success", async () => {
    const state = await syncWithRetry({
      put: async () => ({ status: 200 }),
      sleep: async () => {},
    });
    expect(state).toBe("synced");
  });
});
