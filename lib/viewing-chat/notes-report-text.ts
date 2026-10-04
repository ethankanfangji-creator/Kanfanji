import { userNotesOnly } from "@/lib/viewing-chat/briefing";
import type { BriefingFoundFact } from "@/lib/viewing-chat/briefing-facts";
import type { ChatMediaRef, ChatMessage } from "@/lib/viewing-chat/types";

/** Collect image/video media from user notes for the report gallery. */
export function collectReportMediaRefs(messages: ChatMessage[]): ChatMediaRef[] {
  const seen = new Set<string>();
  const refs: ChatMediaRef[] = [];
  for (const message of userNotesOnly(messages)) {
    for (const item of message.media ?? []) {
      if (item.kind !== "image" && item.kind !== "video") continue;
      const key = item.path || item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push(item);
      if (refs.length >= 24) return refs;
    }
  }
  return refs;
}

export function notesTranscript(messages: ChatMessage[]): string {
  return userNotesOnly(messages)
    .map((message) => {
      const caption =
        message.transcript?.trim() ||
        message.text?.trim() ||
        message.analysis?.trim() ||
        "";
      const mediaKind = message.media?.[0]?.kind;
      const isPhoto = message.type === "photo" || mediaKind === "image";
      const isVideo = mediaKind === "video";
      // Never emit bare "[照片]" / "[影片]" — models copy those tokens into the report body.
      if (isPhoto) {
        const detail = caption || message.analysis?.trim() || "";
        return detail
          ? `- (現場照片說明) ${detail}`
          : "- (現場照片，無文字說明；請勿在報告正文寫「照片」占位)";
      }
      if (isVideo) {
        const detail = caption || message.analysis?.trim() || "";
        return detail
          ? `- (現場影片說明) ${detail}`
          : "- (現場影片，無文字說明；請勿在報告正文寫「影片」占位)";
      }
      if (message.type === "audio") {
        return caption ? `- ${caption}` : "- (語音筆記)";
      }
      if (message.type === "file") {
        return `- (檔案：${message.fileName || caption || "file"})`;
      }
      return caption ? `- ${caption}` : "";
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 12_000);
}

/** Compact PROPERTY_FACTS block for the report LLM. */
export function formatPropertyFactsForReport(facts: BriefingFoundFact[]): string {
  if (!facts.length) return "PROPERTY_FACTS: [] (none found)";
  const lines = facts.slice(0, 60).map((fact) => `- ${fact.field}: ${fact.value} 〔${fact.source}〕`);
  return `PROPERTY_FACTS:\n${lines.join("\n")}`;
}

/** Opening address briefing (pre-touring intro) for the report LLM. */
export function formatBriefingIntroForReport(input: {
  summary: string;
  sources?: string[];
  points?: Array<{ text: string; source: string }>;
} | null): string {
  if (!input) return "BRIEFING_INTRO: (none)";
  const summary = input.summary.trim();
  if (!summary && !(input.points?.length)) return "BRIEFING_INTRO: (none)";
  const lines = [`BRIEFING_INTRO (pre-viewing address intro — weave into the opening of summary):`];
  if (summary) lines.push(summary);
  for (const point of (input.points ?? []).slice(0, 12)) {
    const text = point.text.trim();
    if (!text) continue;
    lines.push(`- ${text}${point.source ? ` 〔${point.source}〕` : ""}`);
  }
  const sources = (input.sources ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  if (sources.length) lines.push(`Sources: ${sources.join("; ")}`);
  return lines.join("\n");
}

/**
 * Light guard kept for tests / optional callers.
 */
export function reclassifyNegotiationRisks(
  risks: string[],
  followUps: string[],
): { risks: string[]; followUps: string[] } {
  const negotiation =
    /議價|砍價|有得談|談判空間|negotiat|room to (talk|offer)|bargain|broker said|經紀說|仲介說/i;
  const keptRisks: string[] = [];
  const nextFollowUps = [...followUps];
  for (const item of risks) {
    if (negotiation.test(item)) {
      if (!nextFollowUps.includes(item)) nextFollowUps.push(item);
    } else {
      keptRisks.push(item);
    }
  }
  return {
    risks: keptRisks.slice(0, 5),
    followUps: nextFollowUps.slice(0, 5),
  };
}
