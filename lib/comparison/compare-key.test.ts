import { describe, expect, it } from "vitest";
import { compareKey } from "./compare-key";

describe("compareKey", () => {
  it("is stable across order and duplicates and differs by user", () => {
    const a = compareKey("user-1", "chat_history", ["b", "a", "a"]);
    const b = compareKey("user-1", "chat_history", ["a", "b"]);
    expect(a).toBe(b);
    expect(a).not.toBe(compareKey("user-2", "chat_history", ["a", "b"]));
  });
});
