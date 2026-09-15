import { assertImmutableId, createEntityId, nowIso } from "./ids";
import { DraftDbError } from "./errors";
import { STORE } from "./migrations";
import {
  filterListed,
  requireFound,
  withStoreError,
  type RepoContext,
} from "./repository-utils";
import type {
  CreateSyncQueueInput,
  ListOptions,
  SyncQueueItem,
  SyncStatus,
  UpdateSyncQueueInput,
} from "./types";

function buildQueueItem(input: CreateSyncQueueInput): SyncQueueItem {
  if (!input.sessionId) {
    throw new DraftDbError("sessionId is required", "invalid_input");
  }
  if (!input.entityId) {
    throw new DraftDbError("entityId is required", "invalid_input");
  }
  if (!input.entityType) {
    throw new DraftDbError("entityType is required", "invalid_input");
  }
  if (!input.operation) {
    throw new DraftDbError("operation is required", "invalid_input");
  }

  const timestamp = nowIso();
  return {
    id: input.id ?? createEntityId(),
    sessionId: input.sessionId,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload ?? null,
    attempts: input.attempts ?? 0,
    lastError: input.lastError ?? null,
    nextRetryAt: input.nextRetryAt ?? null,
    userId: input.userId ?? null,
    syncStatus: input.syncStatus ?? "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: 1,
  };
}

/** Deterministic queue id so the same mediaId/operation is never double-enqueued. */
export function syncQueueItemId(
  entityType: CreateSyncQueueInput["entityType"],
  entityId: string,
  operation: CreateSyncQueueInput["operation"],
): string {
  return `${entityType}:${operation}:${entityId}`;
}

export function createSyncQueueRepository(ctx: RepoContext) {
  return {
    async create(input: CreateSyncQueueInput): Promise<SyncQueueItem> {
      return withStoreError("syncQueue.create", async () => {
        const record = buildQueueItem({
          ...input,
          id: input.id ?? syncQueueItemId(input.entityType, input.entityId, input.operation),
        });
        await ctx.db.put(STORE.syncQueue, record);
        return record;
      });
    },

    /**
     * Insert or refresh a queue row. Same entityType+entityId+operation always
     * maps to one row (idempotent mediaId uploads). Use `force` to re-queue a
     * previously synced / syncing job (explicit retry).
     */
    async enqueueIdempotent(
      input: CreateSyncQueueInput & { force?: boolean },
    ): Promise<SyncQueueItem> {
      return withStoreError("syncQueue.enqueueIdempotent", async () => {
        const id = input.id ?? syncQueueItemId(input.entityType, input.entityId, input.operation);
        const existing = await ctx.db.get(STORE.syncQueue, id);
        if (existing && !existing.deletedAt) {
          if (!input.force && existing.syncStatus === "synced") {
            return existing;
          }
          if (!input.force && existing.syncStatus === "syncing") {
            return existing;
          }
          const next = {
            ...existing,
            payload: input.payload ?? existing.payload,
            userId: input.userId ?? existing.userId,
            syncStatus: "pending" as const,
            lastError: null,
            nextRetryAt: null,
            deletedAt: null,
            updatedAt: nowIso(),
            version: existing.version + 1,
          };
          await ctx.db.put(STORE.syncQueue, next);
          return next;
        }
        const record = buildQueueItem({ ...input, id });
        await ctx.db.put(STORE.syncQueue, record);
        return record;
      });
    },

    async get(id: string): Promise<SyncQueueItem | null> {
      return withStoreError("syncQueue.get", async () => {
        if (!id) throw new DraftDbError("id is required", "invalid_input");
        return (await ctx.db.get(STORE.syncQueue, id)) ?? null;
      });
    },

    async require(id: string): Promise<SyncQueueItem> {
      const row = await this.get(id);
      return requireFound(row ?? undefined, "syncQueueItem", id);
    },

    async update(id: string, patch: UpdateSyncQueueInput): Promise<SyncQueueItem> {
      return withStoreError("syncQueue.update", async () => {
        assertImmutableId(id, (patch as { id?: string }).id);
        const existing = requireFound(
          await ctx.db.get(STORE.syncQueue, id),
          "syncQueueItem",
          id,
        );
        const next: SyncQueueItem = {
          ...existing,
          ...patch,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: nowIso(),
          version: existing.version + 1,
        };
        await ctx.db.put(STORE.syncQueue, next);
        return next;
      });
    },

    async softDelete(id: string): Promise<SyncQueueItem> {
      return this.update(id, {
        deletedAt: nowIso(),
        syncStatus: "synced",
      });
    },

    async delete(id: string): Promise<void> {
      return withStoreError("syncQueue.delete", async () => {
        if (!id) throw new DraftDbError("id is required", "invalid_input");
        await ctx.db.delete(STORE.syncQueue, id);
      });
    },

    async list(options?: ListOptions): Promise<SyncQueueItem[]> {
      return withStoreError("syncQueue.list", async () => {
        const rows = await ctx.db.getAll(STORE.syncQueue);
        return filterListed(rows, options).sort((a, b) =>
          a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
        );
      });
    },

    async listBySession(sessionId: string, options?: ListOptions): Promise<SyncQueueItem[]> {
      return withStoreError("syncQueue.listBySession", async () => {
        if (!sessionId) throw new DraftDbError("sessionId is required", "invalid_input");
        const rows = await ctx.db.getAllFromIndex(STORE.syncQueue, "bySessionId", sessionId);
        return filterListed(rows, options).sort((a, b) =>
          a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
        );
      });
    },

    /** Pending / failed items ready to run (respects nextRetryAt). */
    async listRunnable(now = new Date()): Promise<SyncQueueItem[]> {
      return withStoreError("syncQueue.listRunnable", async () => {
        const rows = await ctx.db.getAll(STORE.syncQueue);
        const nowMs = now.getTime();
        return rows
          .filter((row) => {
            if (row.deletedAt) return false;
            if (row.syncStatus !== "pending" && row.syncStatus !== "failed") return false;
            if (row.nextRetryAt && Date.parse(row.nextRetryAt) > nowMs) return false;
            return true;
          })
          .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      });
    },

    async markStatus(
      id: string,
      syncStatus: SyncStatus,
      patch?: Partial<Pick<SyncQueueItem, "lastError" | "attempts" | "nextRetryAt" | "payload">>,
    ): Promise<SyncQueueItem> {
      return this.update(id, { syncStatus, ...patch });
    },
  };
}

export type SyncQueueRepository = ReturnType<typeof createSyncQueueRepository>;
