import { describe, expect, it } from "vitest";
import { toStoragePath } from "./media-paths";

describe("toStoragePath", () => {
  it("passes through bare storage paths", () => {
    expect(toStoragePath("uid/vid/photos/a.jpg")).toBe("uid/vid/photos/a.jpg");
  });

  it("extracts path from legacy public URLs", () => {
    expect(
      toStoragePath(
        "https://xyz.supabase.co/storage/v1/object/public/viewing-media/uid/vid/photos/a.jpg",
      ),
    ).toBe("uid/vid/photos/a.jpg");
  });

  it("extracts path from signed URLs", () => {
    expect(
      toStoragePath(
        "https://xyz.supabase.co/storage/v1/object/sign/viewing-media/uid/vid/photos/a.jpg?token=abc",
      ),
    ).toBe("uid/vid/photos/a.jpg");
  });

  it("returns null for unrelated URLs", () => {
    expect(toStoragePath("https://example.com/a.jpg")).toBeNull();
  });
});
