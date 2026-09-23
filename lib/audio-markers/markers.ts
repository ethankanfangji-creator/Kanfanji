import {
  normalizeAudioMarkerTagId,
  type AudioMarker,
  type AudioMarkerTagId,
} from "./types";

export function newMarkerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `mk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatMarkerTime(timeSec: number): string {
  const safe = Math.max(0, Math.floor(timeSec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function clampSeekTime(timeSec: number, durationSec: number): number {
  if (!Number.isFinite(timeSec)) return 0;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return Math.max(0, timeSec);
  return Math.min(Math.max(0, timeSec), durationSec);
}

export function createAudioMarker(input: {
  timeSec: number;
  tagId: AudioMarkerTagId | string;
  note?: string;
  viewingSessionId?: string | null;
  mediaId?: string | null;
  createdAt?: string;
  id?: string;
}): AudioMarker {
  return {
    id: input.id ?? newMarkerId(),
    timeSec: Math.max(0, Number(input.timeSec) || 0),
    tagId: normalizeAudioMarkerTagId(String(input.tagId)),
    note: (input.note ?? "").trim(),
    viewingSessionId: input.viewingSessionId ?? null,
    mediaId: input.mediaId ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function sortMarkers(markers: AudioMarker[]): AudioMarker[] {
  return [...markers].sort((a, b) => a.timeSec - b.timeSec || a.createdAt.localeCompare(b.createdAt));
}

export function updateAudioMarker(
  markers: AudioMarker[],
  id: string,
  patch: Partial<Pick<AudioMarker, "tagId" | "note" | "timeSec">>,
): AudioMarker[] {
  return markers.map((marker) => {
    if (marker.id !== id) return marker;
    return {
      ...marker,
      tagId: patch.tagId ? normalizeAudioMarkerTagId(patch.tagId) : marker.tagId,
      note: patch.note !== undefined ? patch.note.trim() : marker.note,
      timeSec: patch.timeSec !== undefined ? Math.max(0, patch.timeSec) : marker.timeSec,
    };
  });
}

export function removeAudioMarker(markers: AudioMarker[], id: string): AudioMarker[] {
  return markers.filter((marker) => marker.id !== id);
}

export function attachMediaToMarkers(
  markers: AudioMarker[],
  mediaId: string,
  viewingSessionId?: string | null,
): AudioMarker[] {
  return markers.map((marker) => ({
    ...marker,
    mediaId: marker.mediaId || mediaId,
    viewingSessionId: marker.viewingSessionId ?? viewingSessionId ?? null,
  }));
}

/**
 * Compact payload for Whisper / future AI summarization prompts.
 * Keep stable keys so server routes can consume without UI coupling.
 */
export function serializeMarkersForAi(markers: AudioMarker[]): Array<{
  t: number;
  tag: AudioMarkerTagId;
  note: string;
}> {
  return sortMarkers(markers).map((marker) => ({
    t: Number(marker.timeSec.toFixed(2)),
    tag: marker.tagId,
    note: marker.note,
  }));
}

/** Prevent accidental double-taps on the same tag within a short window. */
export function canAddMarkerNow(
  lastAddedAtMs: number,
  nowMs: number,
  cooldownMs = 450,
): boolean {
  return nowMs - lastAddedAtMs >= cooldownMs;
}
