/**
 * Guest-local viewing chat threads (IndexedDB-free: localStorage for MVP).
 */

import type { PropertyIntel } from "@/lib/property-intel/types";
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
      messages: thread.messages ?? [],
      report: thread.report ?? null,
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
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
  };
  return upsertLocalThread(thread);
}

export function saveLocalMessages(
  id: string,
  messages: ChatMessage[],
  report?: ChatReportSnapshot | null,
  metadata?: PropertyIntel | null,
): ViewingChatThread | null {
  const existing = getLocalThread(id);
  if (!existing) return null;
  return upsertLocalThread({
    ...existing,
    messages,
    report: report === undefined ? existing.report : report,
    metadata: metadata === undefined ? existing.metadata : metadata,
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
