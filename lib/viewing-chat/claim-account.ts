import { claimLocalThreads } from "./claim-local-threads";
import { buildChatStatePayload } from "./cloud-push";
import {
  getLocalThread,
  listLocalThreads,
  patchLocalThread,
  upsertLocalThread,
} from "./local-store";
import { appendChatMessages } from "./append-messages";
import type { ChatMessage, ViewingChatThread } from "./types";

const LOCK_PREFIX = "kf.claim.";

export async function claimAccountThreads(userId: string): Promise<{ blocked: number }> {
  if (typeof window === "undefined") return { blocked: 0 };
  const lock = `${LOCK_PREFIX}${userId}`;
  if (window.sessionStorage.getItem(lock)) return { blocked: 0 };
  window.sessionStorage.setItem(lock, "1");
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
  return { blocked: result.blocked };
}

export async function pullCloudThreads(userId: string) {
  const listResponse = await fetch("/api/viewing-chat/threads");
  if (!listResponse.ok) return;
  const list = (await listResponse.json()) as {
    threads?: Array<{ id: string; updatedAt: string }>;
  };
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
      chat_state: { pinned?: boolean } | null;
      revision: number;
      updated_at: string;
      created_at?: string;
    };
    const base = local ?? {
      id: row.id,
      address: row.address,
      createdAt: row.created_at ?? row.updated_at,
      updatedAt: row.updated_at,
      messages: [],
      report: null,
      metadata: null,
      pinned: false,
    };
    upsertLocalThread({
      ...base,
      address: row.address || base.address,
      messages: appendChatMessages(base.messages ?? [], row.messages ?? []),
      report: row.report ?? base.report,
      metadata: row.metadata ?? base.metadata,
      pinned: Boolean(row.chat_state?.pinned),
      updatedAt: row.updated_at,
      ownerUserId: userId,
      cloud: { state: "synced", lastSyncedAt: row.updated_at, revision: row.revision } as ViewingChatThread["cloud"],
    });
  }
  for (const thread of listLocalThreads()) {
    if (thread.ownerUserId !== userId) continue;
    if (thread.cloud && thread.cloud.state !== "syncing") continue;
    const detail = await fetch(`/api/viewing-chat/threads/${thread.id}`);
    if (detail.ok) {
      const row = (await detail.json()) as { revision?: number; updated_at?: string };
      patchLocalThread(thread.id, {
        cloud: { state: "synced", lastSyncedAt: row.updated_at ?? null, revision: row.revision } as ViewingChatThread["cloud"],
      });
    }
  }
}
