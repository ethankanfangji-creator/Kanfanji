import { describe, expect, it } from "vitest";
import { safeInternalNextPath } from "./safe-next";

describe("safeInternalNextPath", () => {
  it("retains internal paths with query and hash", () => {
    expect(safeInternalNextPath("/viewings/1?tab=notes#top")).toBe(
      "/viewings/1?tab=notes#top",
    );
  });

  it.each(["https://evil.example", "//evil.example/path", "viewings/1", null])(
    "rejects non-internal redirect %s",
    (value) => {
      expect(safeInternalNextPath(value)).toBe("/");
    },
  );
});
