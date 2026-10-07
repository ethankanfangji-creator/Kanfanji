import {
  DECISION_STATUSES,
  type DecisionStatus,
} from "./types";
import { coerceDecisionStatus } from "./decision-status";

/** Max characters per tag (display + storage). */
export const VIEWING_TAG_MAX_CHARS = 24;
/** Max tags stored per viewing (Ask corpus budget). */
export const VIEWING_TAGS_MAX = 12;

/** Built-in suggestion ids — stored canonically so filters/signals stay stable across locales. */
export const VIEWING_TAG_SUGGESTION_IDS = DECISION_STATUSES;
export type ViewingTagSuggestionId = DecisionStatus;

export function normalizeTagKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isSuggestionTagId(value: string): value is ViewingTagSuggestionId {
  return (VIEWING_TAG_SUGGESTION_IDS as readonly string[]).includes(value);
}

/** Trim, length-cap, dedupe (case-insensitive). Suggestion ids stay lowercase canonical. */
export function coerceViewingTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().slice(0, VIEWING_TAG_MAX_CHARS);
    if (!trimmed) continue;
    const canonical = isSuggestionTagId(normalizeTagKey(trimmed))
      ? (normalizeTagKey(trimmed) as ViewingTagSuggestionId)
      : trimmed;
    const key = normalizeTagKey(canonical);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(canonical);
    if (out.length >= VIEWING_TAGS_MAX) break;
  }
  return out;
}

/**
 * Tags for UI / Ask / filters.
 * Prefer explicit tags; fall back to legacy decisionStatus as a single tag.
 */
export function effectiveViewingTags(input: {
  tags?: unknown;
  decisionStatus?: unknown;
}): string[] {
  const tags = coerceViewingTags(input.tags);
  if (tags.length) return tags;
  const status = coerceDecisionStatus(input.decisionStatus);
  return status ? [status] : [];
}

/** Derive legacy decisionStatus for property_signals + old filters (at most one). */
export function decisionStatusFromTags(tags: readonly string[]): DecisionStatus | null {
  for (const status of DECISION_STATUSES) {
    if (tags.some((tag) => normalizeTagKey(tag) === status)) return status;
  }
  return null;
}

export function tagsInclude(tags: readonly string[], needle: string): boolean {
  const key = normalizeTagKey(needle);
  if (!key) return false;
  return tags.some((tag) => normalizeTagKey(tag) === key);
}

/**
 * Toggle a tag. The four suggestion ids stay mutually exclusive;
 * freeform tags toggle independently.
 */
export function toggleViewingTag(
  current: readonly string[],
  next: string,
): string[] {
  const normalized = coerceViewingTags([next])[0];
  if (!normalized) return coerceViewingTags(current);

  const existing = coerceViewingTags(current);
  if (tagsInclude(existing, normalized)) {
    return existing.filter((tag) => normalizeTagKey(tag) !== normalizeTagKey(normalized));
  }

  if (isSuggestionTagId(normalized)) {
    const withoutOtherSuggestions = existing.filter((tag) => !isSuggestionTagId(tag));
    return coerceViewingTags([...withoutOtherSuggestions, normalized]);
  }

  return coerceViewingTags([...existing, normalized]);
}

export function addViewingTag(current: readonly string[], next: string): string[] {
  const normalized = coerceViewingTags([next])[0];
  if (!normalized) return coerceViewingTags(current);
  if (tagsInclude(current, normalized)) return coerceViewingTags(current);
  return toggleViewingTag(current, normalized);
}

export function removeViewingTag(current: readonly string[], next: string): string[] {
  const key = normalizeTagKey(next);
  return coerceViewingTags(current).filter((tag) => normalizeTagKey(tag) !== key);
}

/** Patch shape when the user edits tags (keeps decisionStatus in sync for signals). */
export function viewingTagsPatch(tags: readonly string[]): {
  tags: string[];
  decisionStatus: DecisionStatus | null;
} {
  const next = coerceViewingTags(tags);
  return {
    tags: next,
    decisionStatus: decisionStatusFromTags(next),
  };
}

export type FrequentTagsSource = {
  tags?: unknown;
  decisionStatus?: unknown;
};

/**
 * Rank tags by how often they appear across viewings (for the add dropdown).
 * Preserves the most common display spelling; excludes already-selected tags.
 */
export function collectFrequentViewingTags(
  sources: readonly FrequentTagsSource[],
  options?: { exclude?: readonly string[]; limit?: number },
): string[] {
  const exclude = new Set(
    (options?.exclude ?? []).map((tag) => normalizeTagKey(tag)).filter(Boolean),
  );
  const limit = Math.max(1, Math.min(40, options?.limit ?? 12));
  const counts = new Map<string, { tag: string; count: number }>();

  for (const source of sources) {
    const tags = effectiveViewingTags(source);
    const seenInSource = new Set<string>();
    for (const tag of tags) {
      const key = normalizeTagKey(tag);
      if (!key || exclude.has(key) || seenInSource.has(key)) continue;
      seenInSource.add(key);
      const prev = counts.get(key);
      if (prev) prev.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }))
    .slice(0, limit)
    .map((row) => row.tag);
}
