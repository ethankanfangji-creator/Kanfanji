import { describe, expect, it } from "vitest";
import {
  browseOriginHome,
  parseBrowseOrigin,
  shouldShowShareBack,
  withBrowseOrigin,
} from "./browse-origin";

describe("browse-origin", () => {
  it("parses known origins only", () => {
    expect(parseBrowseOrigin("viewings")).toBe("viewings");
    expect(parseBrowseOrigin("shares")).toBe("shares");
    expect(parseBrowseOrigin("home")).toBeNull();
    expect(parseBrowseOrigin(null)).toBeNull();
  });

  it("appends from= without dropping other query or hash", () => {
    expect(withBrowseOrigin("/s/abc", "shares")).toBe("/s/abc?from=shares");
    expect(withBrowseOrigin("/s/abc?x=1", "shares")).toBe("/s/abc?x=1&from=shares");
    expect(withBrowseOrigin("/viewings/1#top", "viewings")).toBe(
      "/viewings/1?from=viewings#top",
    );
  });

  it("maps origin to list href", () => {
    expect(browseOriginHome("viewings")).toEqual({
      href: "/viewings",
      kind: "viewings",
    });
    expect(browseOriginHome("shares")).toEqual({ href: "/shares", kind: "shares" });
    expect(browseOriginHome(null)).toEqual({ href: "/", kind: "home" });
  });

  it("shows share back only for hub origin or owner", () => {
    expect(shouldShowShareBack("shares", false)).toBe(true);
    expect(shouldShowShareBack("viewings", false)).toBe(true);
    expect(shouldShowShareBack(undefined, true)).toBe(true);
    expect(shouldShowShareBack(null, false)).toBe(false);
    expect(shouldShowShareBack("other", false)).toBe(false);
  });
});
