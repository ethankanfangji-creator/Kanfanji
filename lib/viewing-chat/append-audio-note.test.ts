import { describe, expect, it } from "vitest";
import { getEphemeralMedia } from "./ephemeral-media";
import {
  appendMessageToList,
  buildAudioNoteMessage,
  mediaRefFromAudioBlob,
  patchMessageTranscript,
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
});
