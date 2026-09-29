import { claimLocalThreads } from "./claim-local-threads";
import { applyChatStateToLocal } from "./chat-state";
import { buildChatStatePayload, pushViewingThread, syncedThreadIdsMissingFromCloud } from "./cloud-push";
import {
  deleteLocalThread,
  getLocalThread,
  listLocalThreads,
  patchLocalThread,
  upsertLocalThread,
} from "./local-store";
import { appendChatMessages } from "./append-messages";
import { removeMediaByThread } from "./media-library";
import type { ChatMessage, ViewingChatThread } from "./types";

const LOCK_PREFIX = "kf.claim.";
const LOCK_MS = 2 * 60 * 1000;

function claimLockFresh(lock: string) {
  const raw = window.sessionStorage.getItem(lock);
  const at = Number(raw);
  if (!Number.isFinite(at) || Date.now() - at > LOCK_MS) {
    window.sessionStorage.removeItem(lock);
    return false;
  }
  return true;
}

export async function claimAccountThreads(userId: string): Promise<{ blocked: number }> {
  if (typeof window === "undefined") return { blocked: 0 };
  const lock = `${LOCK_PREFIX}${userId}`;
  if (claimLockFresh(lock)) return { blocked: 0 };
  window.sessionStorage.setItem(lock, String(Date.now()));
  try {
  const pending = listLocalThreads()
    .filter((thread) => !thread.ownerUserId)
    .map((thread) => ({
      id: thread.id,
      updatedAt: thread.updatedAt,
      ownerUserId: thread.ownerUserId ?? null,
    }));
  const result = await claimLocalThreads({
    threads: pending,
    userId,
    post: async (thread) => {
      const full = getLocalThread(thread.id);
      if (!full) return "network";
      const response = await fetch("/api/viewing-chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: full.id,
          address: full.address,
          messages: full.messages,
          report: full.report,
          metadata: full.metadata,
          chatState: buildChatStatePayload(full),
          clientUpdatedAt: full.updatedAt,
        }),
      });
      if (response.status === 402) {
        patchLocalThread(full.id, {
          ownerUserId: userId,
          cloud: { state: "blocked_limit" },
        });
        return "limit_reached";
      }
      if (!response.ok) return "network";
      const body = (await response.json()) as { revision?: number };
      patchLocalThread(full.id, {
        ownerUserId: userId,
        cloud: { state: "synced", lastSyncedAt: new Date().toISOString(), revision: body.revision } as ViewingChatThread["cloud"],
      });
      return "created";
    },
  });
  for (const thread of pending) {
    const stored = getLocalThread(thread.id);
    if (stored && !stored.ownerUserId && thread.ownerUserId === userId) {
      patchLocalThread(thread.id, {
        ownerUserId: userId,
        cloud: { state: "blocked_limit" },
      });
    }
  }
  if (result.pending > 0) window.sessionStorage.removeItem(lock);
  return { blocked: result.blocked };
  } catch (error) {
    window.sessionStorage.removeItem(lock);
    throw error;
  }
}

export async function pullCloudThreads(userId: string) {
  const listResponse = await fetch("/api/viewing-chat/threads");
  if (!listResponse.ok) return;
  const list = (await listResponse.json()) as {
    threads?: Array<{ id: string; updatedAt: string }>;
  };
  const remoteIds = new Set((list.threads ?? []).map((thread) => thread.id));
  for (const id of syncedThreadIdsMissingFromCloud(listLocalThreads(), remoteIds, userId)) {
    deleteLocalThread(id);
    void removeMediaByThread(id);
  }
  for (const remote of list.threads ?? []) {
    const local = getLocalThread(remote.id);
    const localNewer = local && local.updatedAt >= remote.updatedAt && local.cloud?.state === "synced";
    if (localNewer) continue;
    const detail = await fetch(`/api/viewing-chat/threads/${remote.id}`);
    if (!detail.ok) continue;
    const row = (await detail.json()) as {
      id: string;
      address: string;
      messages: ChatMessage[];
      report: ViewingChatThread["report"];
      metadata: ViewingChatThread["metadata"];
      chat_state: Record<string, unknown> | null;
      revision: number;
      updated_at: string;
      created_at?: string;
    };
    const base: ViewingChatThread = local ?? {
      id: row.id,
      address: row.address,
      createdAt: row.created_at ?? row.updated_at,
      updatedAt: row.updated_at,
      messages: [],
      report: null,
      metadata: null,
      pinned: false,
    };
    const restored = applyChatStateToLocal(base, row.chat_state);
    upsertLocalThread({
      ...restored,
      address: row.address || restored.address,
      messages: appendChatMessages(restored.messages ?? [], row.messages ?? []),
      report: row.report ?? restored.report,
      metadata: row.metadata ?? restored.metadata,
      updatedAt: row.updated_at,
      ownerUserId: userId,
      cloud: { state: "synced", lastSyncedAt: row.updated_at, revision: row.revision },
    });
  }
  for (const thread of listLocalThreads()) {
    if (thread.ownerUserId !== userId) continue;
    if (thread.cloud && thread.cloud.state !== "syncing") continue;
    const detail = await fetch(`/api/viewing-chat/threads/${thread.id}`);
    if (detail.ok) {
      const row = (await detail.json()) as { revision?: number; updated_at?: string; chat_state?: unknown };
      const restored = applyChatStateToLocal(thread, row.chat_state);
      patchLocalThread(thread.id, {
        ...restored,
        cloud: { state: "synced", lastSyncedAt: row.updated_at ?? null, revision: row.revision },
      });
      continue;
    }
    if (detail.status !== 404) {
      patchLocalThread(thread.id, { cloud: { state: "failed" } });
      continue;
    }
    if (thread.cloud?.revision || thread.cloud?.state === "synced") {
      deleteLocalThread(thread.id);
      void removeMediaByThread(thread.id);
      continue;
    }
    const pushed = await pushViewingThread({
      threadId: thread.id,
      address: thread.address,
      previouslySynced: false,
      messages: thread.messages,
      chatState: buildChatStatePayload(thread),
      clientUpdatedAt: new Date().toISOString(),
      report: thread.report,
      metadata: thread.metadata,
    });
    patchLocalThread(thread.id, {
      cloud: pushed.status >= 200 && pushed.status < 300
        ? { state: "synced", lastSyncedAt: new Date().toISOString(), revision: pushed.revision }
        : { state: "failed" },
    });
  }
}
