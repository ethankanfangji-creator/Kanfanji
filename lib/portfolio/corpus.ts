import { formatValue } from "@/lib/viewing-chat/collection/format-value";
import { notesTranscript } from "@/lib/viewing-chat/notes-report-text";
import type { ViewingChatThread } from "@/lib/viewing-chat/types";
import { coerceDecisionStatus } from "./decision-status";
import type { PortfolioFactCard, PortfolioShareComment } from "./types";

const FIELD_IDS = [
  "price",
  "area",
  "layout",
  "floor",
  "noise",
  "odor",
  "light",
  "water_damage",
  "electrical",
  "parking",
  "transit",
  "pros",
  "cons",
] as const;

const NOTES_EXCERPT_MAX = 900;
const MAX_CARDS = 40;
const SHARE_COMMENTS_PER_HOME = 20;
const SHARE_COMMENT_BODY_MAX = 280;

function readField(thread: ViewingChatThread, fieldId: string): string | null {
  if (thread.collectionSkippedFields?.includes(fieldId)) return null;
  const field = thread.propertyRecord?.fields?.[fieldId];
  if (!field || field.status === "unknown") return null;
  const text = formatValue(field.value) || (field.rawText ?? "").trim();
  return text || null;
}

function listSlice(items: string[] | undefined, max: number): string[] {
  return (items ?? []).map((item) => item.trim()).filter(Boolean).slice(0, max);
}

/** Build compact fact cards from local (or hydrated) viewing threads. */
export function buildPortfolioCorpus(threads: ViewingChatThread[]): PortfolioFactCard[] {
  return threads.slice(0, MAX_CARDS).map((thread) => {
    const fields: Record<string, string> = {};
    for (const fieldId of FIELD_IDS) {
      const value = readField(thread, fieldId);
      if (value) fields[fieldId] = value.slice(0, 200);
    }
    const notes = notesTranscript(thread.messages ?? []).slice(0, NOTES_EXCERPT_MAX);
    return {
      id: thread.id,
      address: (thread.normalizedAddress || thread.address || "").trim() || thread.id,
      updatedAt: thread.updatedAt,
      decisionStatus: coerceDecisionStatus(thread.decisionStatus),
      price: fields.price ?? null,
      layout: fields.layout ?? null,
      area: fields.area ?? null,
      pros: listSlice(thread.report?.pros, 5),
      risks: listSlice(thread.report?.risks, 5),
      summary: thread.report?.summary?.trim().slice(0, 400) || null,
      notesExcerpt: notes,
      fields,
      shareComments: [],
    };
  });
}

/** Normalize and cap share comments for a single home. */
export function normalizeShareComments(raw: unknown): PortfolioShareComment[] {
  if (!Array.isArray(raw)) return [];
  const out: PortfolioShareComment[] = [];
  for (const item of raw.slice(0, SHARE_COMMENTS_PER_HOME)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const authorLabel =
      typeof row.authorLabel === "string"
        ? row.authorLabel.trim().slice(0, 40)
        : typeof row.author_label === "string"
          ? row.author_label.trim().slice(0, 40)
          : "";
    const body =
      typeof row.body === "string" ? row.body.trim().slice(0, SHARE_COMMENT_BODY_MAX) : "";
    if (!body) continue;
    out.push({
      authorLabel: authorLabel || "訪客",
      body,
      createdAt: typeof row.createdAt === "string"
        ? row.createdAt
        : typeof row.created_at === "string"
          ? row.created_at
          : "",
    });
  }
  return out;
}

/** Attach share-link comments onto fact cards (keyed by viewing id). */
export function mergeShareCommentsIntoCards(
  cards: PortfolioFactCard[],
  commentsByViewingId: Record<string, unknown>,
): PortfolioFactCard[] {
  return cards.map((card) => ({
    ...card,
    shareComments: normalizeShareComments(commentsByViewingId[card.id]),
  }));
}

/** Serialize cards for the LLM prompt (bounded). */
export function formatCorpusForPrompt(cards: PortfolioFactCard[]): string {
  return cards
    .map((card, index) => {
      const lines = [
        `### Home ${index + 1}`,
        `id: ${card.id}`,
        `address: ${card.address}`,
        `updatedAt: ${card.updatedAt}`,
        `decisionStatus: ${card.decisionStatus ?? "none"}`,
        `price: ${card.price ?? "未提到"}`,
        `layout: ${card.layout ?? "未提到"}`,
        `area: ${card.area ?? "未提到"}`,
      ];
      for (const [key, value] of Object.entries(card.fields)) {
        if (key === "price" || key === "layout" || key === "area") continue;
        lines.push(`${key}: ${value}`);
      }
      if (card.pros.length) lines.push(`pros: ${card.pros.join("；")}`);
      if (card.risks.length) lines.push(`risks: ${card.risks.join("；")}`);
      if (card.summary) lines.push(`summary: ${card.summary}`);
      if (card.notesExcerpt.trim()) lines.push(`notes:\n${card.notesExcerpt}`);
      if (card.shareComments.length) {
        lines.push("EXTERNAL_COMMENTS (from share link, not owner notes):");
        for (const comment of card.shareComments) {
          const when = comment.createdAt ? ` @ ${comment.createdAt}` : "";
          lines.push(`- [${comment.authorLabel}]${when}: ${comment.body}`);
        }
      }
      return lines.join("\n");
    })
    .join("\n\n")
    .slice(0, 48_000);
}

export function validateFactCards(raw: unknown): PortfolioFactCard[] {
  if (!Array.isArray(raw)) return [];
  const out: PortfolioFactCard[] = [];
  for (const item of raw.slice(0, MAX_CARDS)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) continue;
    const address = typeof row.address === "string" ? row.address.trim().slice(0, 500) : id;
    out.push({
      id,
      address,
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
      decisionStatus: coerceDecisionStatus(row.decisionStatus),
      price: typeof row.price === "string" ? row.price.slice(0, 120) : null,
      layout: typeof row.layout === "string" ? row.layout.slice(0, 120) : null,
      area: typeof row.area === "string" ? row.area.slice(0, 120) : null,
      pros: Array.isArray(row.pros)
        ? row.pros.filter((x): x is string => typeof x === "string").slice(0, 5)
        : [],
      risks: Array.isArray(row.risks)
        ? row.risks.filter((x): x is string => typeof x === "string").slice(0, 5)
        : [],
      summary: typeof row.summary === "string" ? row.summary.slice(0, 400) : null,
      notesExcerpt: typeof row.notesExcerpt === "string" ? row.notesExcerpt.slice(0, NOTES_EXCERPT_MAX) : "",
      fields:
        row.fields && typeof row.fields === "object" && !Array.isArray(row.fields)
          ? Object.fromEntries(
              Object.entries(row.fields as Record<string, unknown>)
                .filter((entry): entry is [string, string] => typeof entry[1] === "string")
                .map(([k, v]) => [k.slice(0, 40), v.slice(0, 200)])
                .slice(0, 24),
            )
          : {},
      shareComments: normalizeShareComments(row.shareComments),
    });
  }
  return out;
}
