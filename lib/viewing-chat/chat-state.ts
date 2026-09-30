import type { ViewingChatThread } from "./types";
import { buildChatStatePayload } from "./cloud-push";

const STATE_KEYS = [
  "normalizedAddress",
  "propertyRecord",
  "propertyEvidence",
  "agendaActiveId",
  "agendaSkippedIds",
  "collectionSkippedFields",
  "collectionFocusFieldIds",
  "conversationStatus",
  "pendingConfirm",
  "pinned",
  "sitePin",
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
