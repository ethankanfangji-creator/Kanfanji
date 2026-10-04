import type { ChatMessage } from "./types";

export type ViewingBriefingPoint = {
  text: string;
  source: string;
};

export type ViewingBriefingFeedback = "like" | "dislike";

/** Address-lookup product — not notes, not a fixed checklist. */
export type ViewingBriefing = {
  address: string;
  /** Listing URL used when this briefing was generated (staleness). */
  listingUrl?: string | null;
  /** Connected prose intro (primary UI copy). */
  summary: string;
  /** Optional fact rows kept for compat / regeneration. */
  points: ViewingBriefingPoint[];
  /** Deduped source labels shown under the summary. */
  sources: string[];
  sourcesQueried: string[];
  generatedAt: string;
  /** User rating for this generated intro (per viewing briefing). */
  feedback?: ViewingBriefingFeedback | null;
  feedbackAt?: string | null;
  /** Optional reason captured on dislike (B); empty when skipped (A). */
  feedbackReason?: string | null;
};

const SUMMARY_MAX_CHARS = 600;

export function normalizeListingUrl(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function dedupeBriefingSources(values: string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const source = raw.trim();
    if (!source) continue;
    if (out.some((existing) => existing.toLowerCase() === source.toLowerCase())) continue;
    out.push(source.slice(0, 120));
  }
  return out;
}

/** Join legacy point texts into one paragraph when summary is missing. */
export function summaryFromPoints(points: ViewingBriefingPoint[]): string {
  return points
    .map((point) => point.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sourcesFromPoints(points: ViewingBriefingPoint[]): string[] {
  return dedupeBriefingSources(points.map((point) => point.source));
}

export function clampBriefingSummary(text: string, maxChars = SUMMARY_MAX_CHARS): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  const sliced = cleaned.slice(0, maxChars);
  const lastStop = Math.max(sliced.lastIndexOf("。"), sliced.lastIndexOf(". "), sliced.lastIndexOf("！"));
  if (lastStop > maxChars * 0.5) return sliced.slice(0, lastStop + 1).trim();
  return `${sliced.trim()}…`;
}

/** Display copy: prefer summary, fall back to joined points. */
export function briefingDisplaySummary(briefing: ViewingBriefing): string {
  const summary = briefing.summary?.trim();
  if (summary) return summary;
  return summaryFromPoints(briefing.points);
}

export function briefingDisplaySources(briefing: ViewingBriefing): string[] {
  if (Array.isArray(briefing.sources) && briefing.sources.length) {
    return dedupeBriefingSources(briefing.sources);
  }
  return sourcesFromPoints(briefing.points);
}

export function briefingHasContent(briefing: ViewingBriefing | null | undefined): boolean {
  if (!briefing || !isViewingBriefing(briefing)) return false;
  return Boolean(briefingDisplaySummary(briefing));
}

export function isViewingBriefing(value: unknown): value is ViewingBriefing {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.address !== "string" || typeof row.generatedAt !== "string") return false;
  if (!Array.isArray(row.points)) return false;
  if (row.listingUrl != null && typeof row.listingUrl !== "string") return false;
  // summary/sources optional on old cache — normalize via coerceViewingBriefing
  if (row.summary != null && typeof row.summary !== "string") return false;
  if (row.sources != null && !Array.isArray(row.sources)) return false;
  const pointsOk = row.points.every(
    (point) =>
      point &&
      typeof point === "object" &&
      typeof (point as ViewingBriefingPoint).text === "string" &&
      typeof (point as ViewingBriefingPoint).source === "string",
  );
  if (!pointsOk) return false;
  if (row.sources != null) {
    if (!(row.sources as unknown[]).every((s) => typeof s === "string")) return false;
  }
  if (row.feedback != null && row.feedback !== "like" && row.feedback !== "dislike") return false;
  if (row.feedbackAt != null && typeof row.feedbackAt !== "string") return false;
  if (row.feedbackReason != null && typeof row.feedbackReason !== "string") return false;
  return true;
}

export function normalizeBriefingFeedback(
  value: unknown,
): ViewingBriefingFeedback | null {
  return value === "like" || value === "dislike" ? value : null;
}

/** Normalize old/new shapes into a full ViewingBriefing. */
export function coerceViewingBriefing(value: unknown): ViewingBriefing | null {
  if (!isViewingBriefing(value)) return null;
  const points = value.points;
  const summary =
    typeof value.summary === "string" && value.summary.trim()
      ? clampBriefingSummary(value.summary)
      : clampBriefingSummary(summaryFromPoints(points));
  const sources =
    Array.isArray(value.sources) && value.sources.length
      ? dedupeBriefingSources(value.sources)
      : sourcesFromPoints(points);
  const feedback = normalizeBriefingFeedback(value.feedback);
  const feedbackAt =
    feedback && typeof value.feedbackAt === "string" && value.feedbackAt.trim()
      ? value.feedbackAt
      : null;
  const feedbackReason =
    feedback === "dislike" &&
    typeof value.feedbackReason === "string" &&
    value.feedbackReason.trim()
      ? value.feedbackReason.trim().slice(0, 280)
      : null;
  return {
    address: value.address,
    listingUrl: value.listingUrl ?? null,
    summary,
    points,
    sources,
    sourcesQueried: Array.isArray(value.sourcesQueried) ? value.sourcesQueried : [],
    generatedAt: value.generatedAt,
    feedback,
    feedbackAt,
    feedbackReason,
  };
}

export function briefingMatchesAddress(briefing: ViewingBriefing | null | undefined, address: string) {
  if (!briefing || !isViewingBriefing(briefing)) return false;
  return briefing.address.trim() === address.trim();
}

export function briefingMatchesListingUrl(
  briefing: ViewingBriefing | null | undefined,
  listingUrl: string | null | undefined,
) {
  if (!briefing || !isViewingBriefing(briefing)) return false;
  return normalizeListingUrl(briefing.listingUrl) === normalizeListingUrl(listingUrl);
}

/** Fresh when address + listing URL both match. */
export function briefingIsCurrent(
  briefing: ViewingBriefing | null | undefined,
  address: string,
  listingUrl?: string | null,
) {
  return briefingMatchesAddress(briefing, address) && briefingMatchesListingUrl(briefing, listingUrl);
}

export function emptyBriefing(
  address: string,
  sourcesQueried: string[] = [],
  listingUrl: string | null = null,
): ViewingBriefing {
  return {
    address,
    listingUrl,
    summary: "",
    points: [],
    sources: [],
    sourcesQueried,
    generatedAt: new Date().toISOString(),
    feedback: null,
    feedbackAt: null,
    feedbackReason: null,
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
