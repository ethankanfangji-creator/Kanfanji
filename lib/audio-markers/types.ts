/** Stable realtime audio marker tag ids — labels from i18n. */
export const AUDIO_MARKER_TAG_IDS = [
  "price",
  "noise",
  "leak",
  "like",
  "worry",
  "follow_up",
  "other",
] as const;

export type AudioMarkerTagId = (typeof AUDIO_MARKER_TAG_IDS)[number];

export type AudioMarker = {
  id: string;
  /** Seconds from recording start. */
  timeSec: number;
  tagId: AudioMarkerTagId;
  /** Optional short note. */
  note: string;
  /** DraftDb / local viewing session id when known. */
  viewingSessionId: string | null;
  /** Linked audio media row when available. */
  mediaId?: string | null;
  createdAt: string;
};

export function isAudioMarkerTagId(value: string): value is AudioMarkerTagId {
  return (AUDIO_MARKER_TAG_IDS as readonly string[]).includes(value);
}

export function normalizeAudioMarkerTagId(value: string | undefined | null): AudioMarkerTagId {
  if (value && isAudioMarkerTagId(value)) return value;
  return "other";
}
