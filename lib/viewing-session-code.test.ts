import { describe, expect, it } from "vitest";
import { createSessionCode, isLiveCode } from "./viewing-session-code";

describe("viewing session codes", () => {
  it("uses six unguessable characters and rejects junk", () => {
    const first = createSessionCode(Buffer.from([0, 31, 32, 255, 7, 16]));
    const second = createSessionCode(Buffer.from([1, 2, 3, 4, 5, 6]));
    expect(first).toHaveLength(6);
    expect(second).toHaveLength(6);
    expect(first).not.toBe(second);
    expect(isLiveCode(first)).toBe(true);
    expect(first).not.toMatch(/[01IO]/);
    expect(isLiveCode("123456")).toBe(false);
    expect(isLiveCode("ABCDEFG")).toBe(false);
    expect(isLiveCode("AB CDE")).toBe(false);
  });
});
