import { describe, expect, it } from "vitest";
import {
  beginAsync,
  failAsync,
  initialAsyncState,
  succeedAsync,
} from "./action-state";

describe("async action state", () => {
  it("blocks duplicate submit while loading", () => {
    const idle = initialAsyncState();
    const first = beginAsync(idle);
    expect(first.started).toBe(true);
    expect(first.next.phase).toBe("loading");
    const second = beginAsync(first.next);
    expect(second.started).toBe(false);
    expect(second.next.generation).toBe(first.next.generation);
  });

  it("ignores stale success/error from older generations", () => {
    let state = beginAsync(initialAsyncState()).next;
    const gen1 = state.generation;
    state = beginAsync(state, { blockDuplicate: false }).next;
    const gen2 = state.generation;
    state = succeedAsync(state, gen1);
    expect(state.phase).toBe("loading");
    state = failAsync(state, gen2, "boom");
    expect(state.phase).toBe("error");
    expect(state.error).toBe("boom");
  });
});
