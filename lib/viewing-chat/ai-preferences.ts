export type AiFeedbackKind = "briefing" | "report" | "portfolio";
export type AiFeedbackRating = "like" | "dislike";

export type AiFeedbackEvent = {
  kind: AiFeedbackKind;
  rating: AiFeedbackRating;
  reason?: string | null;
  artifactExcerpt?: string | null;
  createdAt?: string;
};

export const AI_FEEDBACK_REASON_MAX = 280;
export const AI_FEEDBACK_EXCERPT_MAX = 200;
export const AI_FEEDBACK_HISTORY_LIMIT = 12;
export const AI_FEEDBACK_LOCAL_KEY = "kanfangji.aiGenerationFeedback";

export function clampFeedbackReason(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, AI_FEEDBACK_REASON_MAX);
}

export function clampArtifactExcerpt(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, AI_FEEDBACK_EXCERPT_MAX);
}

export function formatPreferenceBlock(
  events: AiFeedbackEvent[],
  kind: AiFeedbackKind,
): string {
  const relevant = events.filter((event) => event.kind === kind).slice(0, AI_FEEDBACK_HISTORY_LIMIT);
  if (!relevant.length) return "";

  const kindLabel =
    kind === "briefing"
      ? "address briefing"
      : kind === "portfolio"
        ? "portfolio Q&A answer"
        : "viewing report";
  const lines = relevant.map((event) => {
    const excerpt = event.artifactExcerpt?.trim();
    const reason = event.reason?.trim();
    if (event.rating === "dislike" && reason) {
      return `- Disliked prior ${kindLabel}${excerpt ? ` («${excerpt}»)` : ""} — reason: ${reason}`;
    }
    if (event.rating === "like" && reason) {
      return `- Liked prior ${kindLabel}${excerpt ? ` («${excerpt}»)` : ""} — reason: ${reason}`;
    }
    if (event.rating === "dislike") {
      return `- Disliked prior ${kindLabel}${excerpt ? ` («${excerpt}»)` : ""} (no written reason)`;
    }
    return `- Liked prior ${kindLabel}${excerpt ? ` («${excerpt}»)` : ""} (no written reason)`;
  });

  return `USER_PREFERENCES (soft guidance):
These are style/content preferences from this user's recent ${kindLabel} ratings.
Treat them as soft guidance, not hard facts about the property.
Do not invent listing facts to please the user.

${lines.join("\n")}`;
}

export function readLocalFeedbackEvents(): AiFeedbackEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AI_FEEDBACK_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => normalizeLocalEvent(row))
      .filter((row): row is AiFeedbackEvent => Boolean(row));
  } catch {
    return [];
  }
}

export function appendLocalFeedbackEvent(event: AiFeedbackEvent): void {
  if (typeof window === "undefined") return;
  const next = [event, ...readLocalFeedbackEvents()].slice(0, 40);
  window.localStorage.setItem(AI_FEEDBACK_LOCAL_KEY, JSON.stringify(next));
}

function normalizeLocalEvent(value: unknown): AiFeedbackEvent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const kind =
    row.kind === "briefing" || row.kind === "report" || row.kind === "portfolio"
      ? row.kind
      : null;
  const rating = row.rating === "like" || row.rating === "dislike" ? row.rating : null;
  if (!kind || !rating) return null;
  return {
    kind,
    rating,
    reason: clampFeedbackReason(typeof row.reason === "string" ? row.reason : null),
    artifactExcerpt: clampArtifactExcerpt(
      typeof row.artifactExcerpt === "string"
        ? row.artifactExcerpt
        : typeof row.artifact_excerpt === "string"
          ? row.artifact_excerpt
          : null,
    ),
    createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
  };
}

export function localPreferenceBlock(kind: AiFeedbackKind): string {
  return formatPreferenceBlock(readLocalFeedbackEvents(), kind);
}
