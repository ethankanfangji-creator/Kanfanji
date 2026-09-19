/**
 * Speech-to-text. Real path uses Whisper via /api/process-recording (server only).
 * UI must not call OpenAI Whisper directly.
 */

export type SpeechServiceStatus = "ready" | "unconfigured" | "error";

export type SpeechTranscribeInput = {
  audio: Blob;
  locale: string;
  signal?: AbortSignal;
};

export type SpeechTranscribeResult =
  | { ok: true; transcript: string }
  | { ok: false; code: string; message: string; retryable: boolean };

export type SpeechService = {
  status(): SpeechServiceStatus;
  transcribe(input: SpeechTranscribeInput): Promise<SpeechTranscribeResult>;
};

export function createMockSpeechService(
  status: SpeechServiceStatus = "unconfigured",
): SpeechService {
  return {
    status: () => status,
    async transcribe() {
      if (status !== "ready") {
        return {
          ok: false,
          code: "speech_unconfigured",
          message: "Speech-to-text is not configured (mock).",
          retryable: false,
        };
      }
      return { ok: true, transcript: "mock transcript" };
    },
  };
}
