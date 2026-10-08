import { describe, expect, it } from "vitest";
import { getEphemeralMedia } from "./ephemeral-media";
import {
  appendMessageToList,
  buildAudioNoteMessage,
  mediaRefFromAudioBlob,
  patchMessageMedia,
  patchMessageTranscript,
  uploadedMediaNeedsCloudSync,
} from "./append-audio-note";

describe("append-audio-note", () => {
  it("builds a visible audio note before any transcript exists", () => {
    const audio = new Blob([" pretendsound "], { type: "audio/webm" });
    const media = mediaRefFromAudioBlob(audio, "media-1");
    expect(getEphemeralMedia("media-1")?.size).toBeGreaterThan(0);

    const message = buildAudioNoteMessage({ audio, media });
    expect(message.type).toBe("audio");
    expect(message.role).toBe("user");
    expect(message.text).toBe("");
    expect(message.media?.[0]?.id).toBe("media-1");
  });

  it("appends then patches transcript without dropping the note", () => {
    const audio = new Blob(["x"], { type: "audio/webm" });
    const media = mediaRefFromAudioBlob(audio, "media-2");
    const note = buildAudioNoteMessage({ audio, media, caption: "" });
    const list = appendMessageToList([], note);
    expect(list).toHaveLength(1);

    const patched = patchMessageTranscript(list, note.id, "廚房很吵");
    expect(patched).toHaveLength(1);
    expect(patched[0]?.transcript).toBe("廚房很吵");
    expect(patched[0]?.text).toBe("廚房很吵");
    expect(patched[0]?.media?.[0]?.id).toBe("media-2");
  });

  it("keeps the original media id when a late upload attaches a storage path", () => {
    const audio = new Blob(["x"], { type: "audio/webm" });
    const media = mediaRefFromAudioBlob(audio, "media-3", "note-1.webm");
    const note = buildAudioNoteMessage({ audio, media });
    const uploaded = {
      id: "different-idb-id",
      kind: "audio" as const,
      name: "note-1.webm",
      mime: "audio/webm",
      size: 4,
      path: "user-1/thread-1/audios/media-3",
    };
    const patched = patchMessageMedia([note], note.id, uploaded, media.id);
    expect(patched[0]?.media?.[0]).toMatchObject({
      id: "media-3",
      path: "user-1/thread-1/audios/media-3",
      kind: "audio",
    });
    expect(patched[0]?.transcript).toBeUndefined();
    expect(uploadedMediaNeedsCloudSync(uploaded)).toBe(true);
    expect(uploadedMediaNeedsCloudSync({ path: null })).toBe(false);
  });
});
