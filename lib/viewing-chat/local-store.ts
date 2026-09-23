/**
 * Guest-local viewing chat threads (IndexedDB-free: localStorage for MVP).
 */

import type { PropertyIntel } from "@/lib/property-intel/types";
import type { PropertyReport } from "@/lib/property-facts/report-types";
import type { ChatMessage, ChatReportSnapshot, ViewingChatThread } from "./types";

const STORAGE_KEY = "kanfangji.viewingChat.threads.v1";

function readAll(): ViewingChatThread[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as ViewingChatThread[]).map((thread) => ({
      ...thread,
      metadata: thread.metadata ?? null,
      propertyReport: thread.propertyReport ?? null,
      messages: thread.messages ?? [],
      report: thread.report ?? null,
      pinned: Boolean(thread.pinned),
      stage: thread.stage ?? undefined,
      sources: thread.sources ?? [],
      pipelineSteps: thread.pipelineSteps ?? [],
      propertyData: thread.propertyData ?? null,
      initialReport: thread.initialReport ?? null,
      skippedSources: Boolean(thread.skippedSources),
      agendaActiveId: thread.agendaActiveId ?? null,
      agendaSkippedIds: Array.isArray(thread.agendaSkippedIds)
        ? thread.agendaSkippedIds
        : [],
      agendaMarket: thread.agendaMarket ?? undefined,
    }));
  } catch {
    return [];
  }
}

function writeAll(threads: ViewingChatThread[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads.slice(0, 40)));
}

export function listLocalThreads(): ViewingChatThread[] {
  return readAll().sort((a, b) => {
    const pin = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pin !== 0) return pin;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function getLocalThread(id: string): ViewingChatThread | null {
  return readAll().find((t) => t.id === id) ?? null;
}

export function upsertLocalThread(thread: ViewingChatThread): ViewingChatThread {
  const all = readAll().filter((t) => t.id !== thread.id);
  all.unshift(thread);
  writeAll(all);
  return thread;
}

export function createLocalThread(
  address: string,
  initialMessages: ChatMessage[] = [],
  metadata: PropertyIntel | null = null,
  propertyReport: PropertyReport | null = null,
): ViewingChatThread {
  const now = new Date().toISOString();
  const thread: ViewingChatThread = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `local_${Date.now()}`,
    address: address.trim(),
    createdAt: now,
    updatedAt: now,
    messages: initialMessages,
    report: null,
    metadata,
    propertyReport,
    pinned: false,
    stage: "address_received",
    sources: [],
    pipelineSteps: [],
    propertyData: null,
    initialReport: null,
    skippedSources: false,
    agendaActiveId: null,
    agendaSkippedIds: [],
    agendaMarket: undefined,
  };
  return upsertLocalThread(thread);
}

export function saveLocalMessages(
  id: string,
  messages: ChatMessage[],
  report?: ChatReportSnapshot | null,
  metadata?: PropertyIntel | null,
  propertyReport?: PropertyReport | null,
): ViewingChatThread | null {
  const existing = getLocalThread(id);
  if (!existing) return null;
  return upsertLocalThread({
    ...existing,
    messages,
    report: report === undefined ? existing.report : report,
    metadata: metadata === undefined ? existing.metadata : metadata,
    propertyReport:
      propertyReport === undefined ? existing.propertyReport : propertyReport,
    updatedAt: new Date().toISOString(),
  });
}

export function patchLocalThread(
  id: string,
  patch: Partial<ViewingChatThread>,
): ViewingChatThread | null {
  const existing = getLocalThread(id);
  if (!existing) return null;
  return upsertLocalThread({
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });
}

export function deleteLocalThread(id: string): boolean {
  const all = readAll();
  const next = all.filter((t) => t.id !== id);
  if (next.length === all.length) return false;
  writeAll(next);
  return true;
}

export function setLocalThreadPinned(id: string, pinned: boolean): ViewingChatThread | null {
  const existing = getLocalThread(id);
  if (!existing) return null;
  return upsertLocalThread({
    ...existing,
    pinned,
    updatedAt: existing.updatedAt,
  });
}
