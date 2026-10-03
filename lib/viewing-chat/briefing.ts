import type { ChatMessage } from "./types";

export type ViewingBriefingPoint = {
  text: string;
  source: string;
};

/** Address-lookup product — not notes, not a fixed checklist. */
export type ViewingBriefing = {
  address: string;
  points: ViewingBriefingPoint[];
  sourcesQueried: string[];
  generatedAt: string;
};

export function isViewingBriefing(value: unknown): value is ViewingBriefing {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.address !== "string" || typeof row.generatedAt !== "string") return false;
  if (!Array.isArray(row.points)) return false;
  return row.points.every(
    (point) =>
      point &&
      typeof point === "object" &&
      typeof (point as ViewingBriefingPoint).text === "string" &&
      typeof (point as ViewingBriefingPoint).source === "string",
  );
}

export function briefingMatchesAddress(briefing: ViewingBriefing | null | undefined, address: string) {
  if (!briefing || !isViewingBriefing(briefing)) return false;
  return briefing.address.trim() === address.trim();
}

export function emptyBriefing(address: string, sourcesQueried: string[] = []): ViewingBriefing {
  return {
    address,
    points: [],
    sourcesQueried,
    generatedAt: new Date().toISOString(),
  };
}

/** Fingerprint of user notes only — AI/report bubbles never count. */
export function notesFingerprint(messages: ChatMessage[]): string {
  const notes = messages
    .filter((message) => message.role === "user")
    .map((message) => {
      const body =
        message.transcript?.trim() ||
        message.text?.trim() ||
        (message.type === "photo" ? `photo:${message.media?.[0]?.id ?? message.id}` : "") ||
        (message.type === "audio" ? `audio:${message.media?.[0]?.id ?? message.id}` : "") ||
        (message.type === "file" ? `file:${message.fileName ?? message.id}` : "") ||
        "";
      return `${message.id}|${message.type}|${body}`;
    })
    .join("\n");
  let hash = 0;
  for (let i = 0; i < notes.length; i += 1) {
    hash = (hash * 31 + notes.charCodeAt(i)) >>> 0;
  }
  return `${messages.filter((m) => m.role === "user").length}:${hash.toString(16)}`;
}

export function userNotesOnly(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.role === "user");
}
