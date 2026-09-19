// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { takeInputFiles } from "./media-import";

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
