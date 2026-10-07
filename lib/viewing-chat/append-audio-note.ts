/**
 * Pure helper: build + persist an audio note before transcription.
 * Extracted so unit tests can verify “note lands even if transcribe fails”.
 */

import { putEphemeralMedia } from "@/lib/viewing-chat/ephemeral-media";
import type { ChatMediaRef, ChatMessage } from "@/lib/viewing-chat/types";
import { createUserMessage } from "@/lib/viewing-chat/types";

export function buildAudioNoteMessage(input: {
  audio: Blob;
  caption?: string;
  media: ChatMediaRef;
}): ChatMessage {
  return createUserMessage({
    type: "audio",
    // Caption if the user typed one; otherwise leave empty so the UI can show
    // “transcribing…” in place of a mic emoji until Whisper returns.
    text: input.caption?.trim() || "",
    media: [input.media],
  });
}

export function mediaRefFromAudioBlob(
  audio: Blob,
  id: string,
  name = "note.webm",
): ChatMediaRef {
  putEphemeralMedia(id, audio);
  return {
    id,
    kind: "audio",
    name,
    mime: audio.type || "audio/webm",
    size: audio.size,
    path: null,
  };
}

export function appendMessageToList(
  existing: ChatMessage[],
  message: ChatMessage,
): ChatMessage[] {
  return [...existing, message];
}

export function patchMessageTranscript(
  messages: ChatMessage[],
  messageId: string,
  transcript: string,
  caption?: string,
): ChatMessage[] {
  return messages.map((item) =>
    item.id === messageId
      ? {
          ...item,
          transcript,
          text: transcript || caption?.trim() || item.text,
        }
      : item,
  );
}
