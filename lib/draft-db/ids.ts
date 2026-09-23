import { DraftDbError } from "./errors";

/** Stable, immutable client-side IDs (UUID v4). */
export function createEntityId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes — still collision-resistant enough for local drafts.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function assertImmutableId(existingId: string, incomingId: string | undefined): void {
  if (incomingId !== undefined && incomingId !== existingId) {
    throw new DraftDbError("Entity id is immutable and cannot be changed", "immutable_id");
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
