import { describe, expect, it } from "vitest";
import {
  assertOwnerMediaPath,
  assertSharePhotoPath,
  isLikelyExpiredSignedUrl,
  isViewingMediaPath,
} from "./media-sign";

describe("isViewingMediaPath", () => {
  it("accepts canonical owner/viewing/folder/file paths", () => {
    expect(
      isViewingMediaPath("user-1/viewing-1/photos/a.jpg"),
    ).toBe(true);
    expect(isViewingMediaPath("user-1/viewing-1/videos/a.mp4")).toBe(true);
    expect(isViewingMediaPath("user-1/viewing-1/audios/a.webm")).toBe(true);
  });

  it("rejects short or unknown folders", () => {
    expect(isViewingMediaPath("user-1/viewing-1/photos")).toBe(false);
    expect(isViewingMediaPath("user-1/viewing-1/other/a.jpg")).toBe(false);
  });
});

describe("assertOwnerMediaPath / assertSharePhotoPath", () => {
  it("allows matching owner", () => {
    expect(() =>
      assertOwnerMediaPath("owner/v1/photos/x.jpg", "owner"),
    ).not.toThrow();
  });

  it("forbids other owners", () => {
    expect(() => assertOwnerMediaPath("other/v1/photos/x.jpg", "owner")).toThrow(
      /FORBIDDEN/,
    );
  });

  it("share signing only allows photos under the published viewing", () => {
    expect(() =>
      assertSharePhotoPath("owner/v1/photos/x.jpg", "owner", "v1"),
    ).not.toThrow();
    expect(() =>
      assertSharePhotoPath("owner/v1/videos/x.mp4", "owner", "v1"),
    ).toThrow(/SHARE_MEDIA_FORBIDDEN/);
    expect(() =>
      assertSharePhotoPath("owner/other/photos/x.jpg", "owner", "v1"),
    ).toThrow(/SHARE_MEDIA_FORBIDDEN/);
  });
});

describe("isLikelyExpiredSignedUrl", () => {
  it("detects exp query param in the past", () => {
    const url = "https://example.supabase.co/storage/v1/object/sign/x?exp=1&token=abc";
    expect(isLikelyExpiredSignedUrl(url, 2_000)).toBe(true);
  });

  it("treats future exp as fresh", () => {
    const url = "https://example.supabase.co/storage/v1/object/sign/x?exp=9999999999";
    expect(isLikelyExpiredSignedUrl(url, Date.now())).toBe(false);
  });
});
