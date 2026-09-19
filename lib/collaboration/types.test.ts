import { describe, expect, it } from "vitest";
import { roleAtLeast } from "./types";

describe("collaboration roles", () => {
  it("keeps owner and editor as the only editing roles", () => {
    expect(roleAtLeast("owner", "editor")).toBe(true);
    expect(roleAtLeast("editor", "editor")).toBe(true);
    expect(roleAtLeast("commenter", "editor")).toBe(false);
    expect(roleAtLeast("viewer", "editor")).toBe(false);
  });

  it("allows comments from commenter and above", () => {
    expect(roleAtLeast("owner", "commenter")).toBe(true);
    expect(roleAtLeast("editor", "commenter")).toBe(true);
    expect(roleAtLeast("commenter", "commenter")).toBe(true);
    expect(roleAtLeast("viewer", "commenter")).toBe(false);
  });
});

