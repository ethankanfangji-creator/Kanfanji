import { coerceDecisionStatus } from "@/lib/portfolio/decision-status";
import {
  coerceViewingTags,
  decisionStatusFromTags,
} from "@/lib/portfolio/viewing-tags";
import type { ViewingChatThread } from "./types";
import { buildChatStatePayload } from "./cloud-push";

/** Persisted notes-session fields. Coach-only keys (agenda/askedCount/…) are no longer written. */
const STATE_KEYS = [
  "normalizedAddress",
  "propertyRecord",
  "propertyEvidence",
  "collectionSkippedFields",
  "conversationStatus",
  "pinned",
  "sitePin",
  "unitKey",
  "unitLabel",
  "placeId",
  "briefing",
  "listingUrl",
  "reportNotesFingerprint",
  "decisionStatus",
  "tags",
] as const;

type StateKey = (typeof STATE_KEYS)[number];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function mergePropertyRecord(existing: unknown, incoming: unknown) {
  if (incoming == null) return existing ?? null;
  const next = asRecord(incoming);
  const prior = asRecord(existing);
  if (!next) return existing ?? null;
  if (!prior) return next;
  const priorFields = asRecord(prior.fields) ?? {};
  const nextFields = asRecord(next.fields);
  return {
    ...prior,
    ...next,
    fields: nextFields ? { ...priorFields, ...nextFields } : priorFields,
  };
}

export function mergeChatState(existing: unknown, incoming: Record<string, unknown>) {
  const prior = asRecord(existing) ?? {};
  const next: Record<string, unknown> = { ...prior, v: 1 };
  for (const key of STATE_KEYS) {
    if (!Object.hasOwn(incoming, key)) continue;
    const value = incoming[key];
    if (key === "propertyRecord") {
      next.propertyRecord = mergePropertyRecord(prior.propertyRecord, value);
      continue;
    }
    if (key === "pinned") {
      if (typeof value === "boolean") next.pinned = value;
      continue;
    }
    if (key === "listingUrl") {
      if (value === null) next.listingUrl = null;
      else if (typeof value === "string") next.listingUrl = value.trim() || null;
      continue;
    }
    if (key === "decisionStatus") {
      next.decisionStatus = coerceDecisionStatus(value);
      continue;
    }
    if (key === "tags") {
      const tags = coerceViewingTags(value);
      next.tags = tags;
      // Keep legacy status aligned when tags are the source of truth.
      if (Object.hasOwn(incoming, "tags") && !Object.hasOwn(incoming, "decisionStatus")) {
        next.decisionStatus = decisionStatusFromTags(tags);
      }
      continue;
    }
    if (value == null) continue;
    next[key] = value;
  }
  return next;
}

export function applyChatStateToLocal(
  thread: ViewingChatThread,
  chatState: unknown,
): ViewingChatThread {
  const state = asRecord(chatState);
  if (!state || state.v !== 1) return thread;
  const patch: Partial<ViewingChatThread> = {};
  for (const key of STATE_KEYS) {
    if (state[key] !== undefined) patch[key] = state[key] as never;
  }
  // Drop empty briefing shells so the session UI can regenerate.
  if (patch.briefing != null) {
    const row = patch.briefing as { summary?: unknown; points?: unknown };
    const summary = typeof row.summary === "string" ? row.summary.trim() : "";
    const points = Array.isArray(row.points) ? row.points : [];
    if (!summary && points.length === 0) {
      delete patch.briefing;
    }
  }
  return { ...thread, ...patch };
}

export function roundTripChatState(thread: ViewingChatThread) {
  const built = buildChatStatePayload(thread);
  const applied = applyChatStateToLocal(
    { ...thread, propertyRecord: null, pinned: false, normalizedAddress: null },
    built,
  );
  return buildChatStatePayload(applied);
}

export type { StateKey };
