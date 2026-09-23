import { describe, expect, it } from "vitest";
import { UnavailablePhotoAddressRecognizer } from "./types";

describe("photo address recognition contract", () => {
  it("keeps OCR/vision address recognition behind an unimplemented interface", async () => {
    const recognizer = new UnavailablePhotoAddressRecognizer();
    const result = await recognizer.recognize({
      image: new Blob(["not-an-image"], { type: "image/jpeg" }),
      mimeType: "image/jpeg",
    });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("not_implemented");
    }
  });
});
