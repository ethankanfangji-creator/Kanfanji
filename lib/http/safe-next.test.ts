import { describe, expect, it } from "vitest";
import { safeInternalNextPath } from "./safe-next";

describe("safeInternalNextPath", () => {
  it("retains internal paths with query and hash", () => {
    expect(safeInternalNextPath("/")).toBe("/");
    expect(safeInternalNextPath("/viewings")).toBe("/viewings");
    expect(safeInternalNextPath("/viewings/1?tab=notes#top")).toBe(
      "/viewings/1?tab=notes#top",
    );
  });

  it.each([
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.com",
    "\\evil.com",
    "@evil.com",
    "viewings/1",
    "https://example.com@evil.com",
    null,
  ])("rejects non-internal redirect %s", (value) => {
    expect(safeInternalNextPath(value)).toBe("/");
  });

  it("keeps post-login redirects on the same origin", () => {
    const origin = "https://kanfangji.example";
    expect(`${origin}${safeInternalNextPath("@evil.com")}`).toBe(`${origin}/`);
    expect(`${origin}${safeInternalNextPath("/viewings")}`).toBe(
      `${origin}/viewings`,
    );
  });
});
