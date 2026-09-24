import { describe, expect, it } from "vitest";
import { shouldStartNewViewing } from "./should-start-new-viewing";

describe("shouldStartNewViewing", () => {
  it("resets only when leaving an active viewing thread", () => {
    expect(shouldStartNewViewing(true)).toBe(true);
    expect(shouldStartNewViewing(false)).toBe(false);
  });
});
