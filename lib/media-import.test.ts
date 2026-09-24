// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { mapMediaImportErrorCode, takeInputFiles } from "./media-import";

describe("takeInputFiles", () => {
  it("snapshots Safari's live FileList before resetting the input", () => {
    const photo = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
    let files: File[] = [photo];
    const input = {
      get files() {
        return files as unknown as FileList;
      },
      get value() {
        return files.length ? "photo.jpg" : "";
      },
      set value(next: string) {
        if (next === "") files = [];
      },
    };

    expect(takeInputFiles(input)).toEqual([photo]);
    expect(input.files).toHaveLength(0);
  });
});

describe("mapMediaImportErrorCode", () => {
  const copy = {
    invalidPhoto: "bad photo",
    invalidVideo: "bad video",
    emptyFile: "empty",
    photoTooLarge: "photo big",
    videoTooLarge: "video big",
  };

  it("maps known codes", () => {
    expect(mapMediaImportErrorCode("invalid-photo-type", copy)).toBe("bad photo");
    expect(mapMediaImportErrorCode("invalid-video-type", copy)).toBe("bad video");
    expect(mapMediaImportErrorCode("empty-file", copy)).toBe("empty");
    expect(mapMediaImportErrorCode("photo-too-large", copy)).toBe("photo big");
    expect(mapMediaImportErrorCode("video-too-large", copy)).toBe("video big");
  });
});
