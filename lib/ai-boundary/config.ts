export const AI_CONSENT_VERSION = "2026-09-15";

export const AI_LOCALES = ["en", "th", "zh-Hans", "zh-Hant"] as const;
export type AiLocale = (typeof AI_LOCALES)[number];

export const AI_MARKETS = ["CA", "US", "TW", "TH", "OTHER"] as const;
export type AiMarket = (typeof AI_MARKETS)[number];

export const AI_LIMITS = {
  contentLengthBytes: 13 * 1024 * 1024,
  audioBytes: 12 * 1024 * 1024,
  imageBytes: 2 * 1024 * 1024,
  imageBase64Chars: 3 * 1024 * 1024,
  durationSec: 60 * 30,
  questions: 60,
  questionText: 300,
  contextJsonChars: 12_000,
  markers: 80,
  markerNote: 300,
  genericString: 500,
  sessionId: 128,
} as const;

export const AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/m4a",
  "audio/x-m4a",
]);

export const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function aiTimeoutMs(): number {
  const configured = Number(process.env.AI_UPSTREAM_TIMEOUT_MS);
  return Number.isFinite(configured)
    ? Math.max(5_000, Math.min(configured, 90_000))
    : 45_000;
}
