// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  isReadableAttachment,
  isVideoAttachment,
  mapMediaImportErrorCode,
  takeInputFiles,
} from "./media-import";

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

describe("isVideoAttachment", () => {
  it("detects MIME and common extensions", () => {
    expect(
      isVideoAttachment({ type: "video/mp4", name: "clip.bin" }),
    ).toBe(true);
    expect(isVideoAttachment({ type: "", name: "walkthrough.MOV" })).toBe(true);
    expect(isVideoAttachment({ type: "application/pdf", name: "a.pdf" })).toBe(
      false,
    );
  });
});

describe("isReadableAttachment", () => {
  it("allows pdf and plain text only", () => {
    expect(isReadableAttachment({ type: "application/pdf", name: "a.pdf" })).toBe(
      true,
    );
    expect(isReadableAttachment({ type: "text/plain", name: "n.txt" })).toBe(true);
    expect(
      isReadableAttachment({
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        name: "a.docx",
      }),
    ).toBe(false);
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
