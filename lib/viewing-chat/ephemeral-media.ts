/**
 * In-memory media blobs for the current tab session.
 * Used when IndexedDB put fails, so notes can still render an audio player.
 */

const blobs = new Map<string, Blob>();

export function putEphemeralMedia(id: string, blob: Blob): void {
  blobs.set(id, blob);
}

export function getEphemeralMedia(id: string): Blob | null {
  return blobs.get(id) ?? null;
}

export function removeEphemeralMedia(id: string): void {
  blobs.delete(id);
}
