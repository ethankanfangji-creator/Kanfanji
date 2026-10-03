import type { ChatMessage } from "./types";

/** AI prep cues from the address only — never written as if the home was already walked. */
export type ViewingBriefing = {
  address: string;
  smell: string[];
  look: string[];
  ask: string[];
  generatedAt: string;
};

export function isViewingBriefing(value: unknown): value is ViewingBriefing {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.address === "string" &&
    Array.isArray(row.smell) &&
    Array.isArray(row.look) &&
    Array.isArray(row.ask) &&
    typeof row.generatedAt === "string"
  );
}

export function briefingMatchesAddress(briefing: ViewingBriefing | null | undefined, address: string) {
  if (!briefing) return false;
  return briefing.address.trim() === address.trim();
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

export function fallbackBriefing(address: string): ViewingBriefing {
  return {
    address,
    smell: ["進門氣味（潮／菸／寵物／污水）", "廚房與浴室有無異味"],
    look: ["採光與窗戶", "壁面、天花板有無水痕或壁癌", "格局是否符合必備需求"],
    ask: ["屋齡與重大修繕", "管理費／車位", "鄰居與噪音時段"],
    generatedAt: new Date().toISOString(),
  };
}
