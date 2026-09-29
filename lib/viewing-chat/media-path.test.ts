import { describe, expect, it } from "vitest";
import { classifyOwnedMediaPath } from "./media-path";

describe("classifyOwnedMediaPath", () => {
  it("accepts the owner photo prefix", () => {
    expect(classifyOwnedMediaPath("user/view/photos/pic", "user", "view")).toBe("photo_urls");
  });

  it("rejects another user's path", () => {
    expect(classifyOwnedMediaPath("other/view/photos/pic", "user", "view")).toBeNull();
  });
});
