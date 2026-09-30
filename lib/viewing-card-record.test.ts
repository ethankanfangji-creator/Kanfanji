import { describe, expect, it } from "vitest";
import {
  cardNotes,
  cardPhotoStoragePath,
  cardVoiceStoragePath,
  isStoredCardPhotoPath,
} from "./viewing-card-record";

describe("viewing card photos", () => {
  it("stores a private path that includes the viewing and the card", () => {
    const path = cardPhotoStoragePath({
      ownerId: "owner-1",
      viewingId: "view-1",
      cardId: "card-1",
      file: new Blob(["x"], { type: "image/jpeg" }),
    });
    expect(path.startsWith("owner-1/view-1/photos/card-1/")).toBe(true);
    expect(path.endsWith(".jpg")).toBe(true);
    expect(path).not.toMatch(/^https?:/);
    expect(isStoredCardPhotoPath(path, "owner-1", "view-1", "card-1")).toBe(true);
  });

  it("rejects a public url", () => {
    expect(
      isStoredCardPhotoPath(
        "https://example.supabase.co/storage/v1/object/public/viewing-media/o/v/photos/c/a.jpg",
        "o",
        "v",
        "c",
      ),
    ).toBe(false);
  });
});

describe("viewing card voice", () => {
  it("stores a private audio path that includes the viewing and the card", () => {
    const path = cardVoiceStoragePath({
      ownerId: "owner-1",
      viewingId: "view-1",
      cardId: "card-1",
      file: new Blob(["x"], { type: "audio/webm" }),
    });
    expect(path.startsWith("owner-1/view-1/audios/card-1/")).toBe(true);
    expect(path.endsWith(".webm")).toBe(true);
    expect(path).not.toMatch(/^https?:/);
  });
});

describe("card notes", () => {
  it("keeps a short note and rejects a huge one", () => {
    expect(cardNotes("  採光不錯  ")).toBe("採光不錯");
    expect(cardNotes("x".repeat(2001))).toBeNull();
  });
});
