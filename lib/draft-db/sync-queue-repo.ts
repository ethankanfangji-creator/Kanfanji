import { assertImmutableId, createEntityId, nowIso } from "./ids";
import { DraftDbError } from "./errors";
import { STORE } from "./migrations";
import {
  filterListed,
  inAccountScope,
  isVisibleInScope,
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

function buildQueueItem(input: CreateSyncQueueInput, defaultScope?: string): SyncQueueItem {
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
    accountScope: input.accountScope ?? defaultScope ?? "guest:legacy",
    sessionId: input.sessionId,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload ?? null,
    attempts: input.attempts ?? 0,
    lastError: input.lastError ?? null,
    nextRetryAt: input.nextRetryAt ?? null,
    leaseOwner: input.leaseOwner ?? null,
    leaseExpiresAt: input.leaseExpiresAt ?? null,
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
  accountScope = "guest:legacy",
): string {
  return `${accountScope}:${entityType}:${operation}:${entityId}`;
}

export function createSyncQueueRepository(ctx: RepoContext) {
  return {
    async create(input: CreateSyncQueueInput): Promise<SyncQueueItem> {
      return withStoreError("syncQueue.create", async () => {
        const record = buildQueueItem({
          ...input,
          id:
            input.id ??
            syncQueueItemId(
              input.entityType,
              input.entityId,
              input.operation,
              input.accountScope ?? ctx.accountScope,
            ),
        }, ctx.accountScope);
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
        const scope = input.accountScope ?? ctx.accountScope ?? "guest:legacy";
        const id = input.id ?? syncQueueItemId(input.entityType, input.entityId, input.operation, scope);
        const existing = await ctx.db.get(STORE.syncQueue, id);
        if (existing && !existing.deletedAt && isVisibleInScope(existing, ctx.accountScope)) {
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
            leaseOwner: null,
            leaseExpiresAt: null,
            deletedAt: null,
            updatedAt: nowIso(),
            version: existing.version + 1,
          };
          await ctx.db.put(STORE.syncQueue, next);
          return next;
        }
        const record = buildQueueItem({ ...input, id, accountScope: scope }, ctx.accountScope);
        await ctx.db.put(STORE.syncQueue, record);
        return record;
      });
    },

    async get(id: string): Promise<SyncQueueItem | null> {
      return withStoreError("syncQueue.get", async () => {
        if (!id) throw new DraftDbError("id is required", "invalid_input");
        const row = await ctx.db.get(STORE.syncQueue, id);
        return isVisibleInScope(row, ctx.accountScope) ? row ?? null : null;
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
        if (!isVisibleInScope(existing, ctx.accountScope)) {
          throw new DraftDbError("queue item is locked to another account", "not_found");
        }
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

    async transitionClaimed(
      claim: Pick<SyncQueueItem, "id" | "leaseOwner" | "version">,
      patch: UpdateSyncQueueInput,
    ): Promise<SyncQueueItem> {
      return withStoreError("syncQueue.transitionClaimed", async () => {
        if (!claim.leaseOwner) {
          throw new DraftDbError("queue claim has no lease owner", "invalid_input");
        }
        const tx = ctx.db.transaction(STORE.syncQueue, "readwrite");
        const store = tx.objectStore(STORE.syncQueue);
        const existing = await store.get(claim.id);
        if (
          !existing ||
          !isVisibleInScope(existing, ctx.accountScope) ||
          existing.syncStatus !== "syncing" ||
          existing.leaseOwner !== claim.leaseOwner ||
          existing.version !== claim.version
        ) {
          await tx.done;
          throw new DraftDbError("queue lease was reclaimed", "lease_lost");
        }
        const next: SyncQueueItem = {
          ...existing,
          ...patch,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: nowIso(),
          version: existing.version + 1,
        };
        await store.put(next);
        await tx.done;
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
        const existing = await ctx.db.get(STORE.syncQueue, id);
        if (!isVisibleInScope(existing, ctx.accountScope)) {
          throw new DraftDbError("queue item is locked to another account", "not_found");
        }
        await ctx.db.delete(STORE.syncQueue, id);
      });
    },

    async list(options?: ListOptions): Promise<SyncQueueItem[]> {
      return withStoreError("syncQueue.list", async () => {
        const rows = await ctx.db.getAll(STORE.syncQueue);
        return filterListed(inAccountScope(rows, ctx.accountScope), options).sort((a, b) =>
          a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
        );
      });
    },

    async listBySession(sessionId: string, options?: ListOptions): Promise<SyncQueueItem[]> {
      return withStoreError("syncQueue.listBySession", async () => {
        if (!sessionId) throw new DraftDbError("sessionId is required", "invalid_input");
        const rows = await ctx.db.getAllFromIndex(STORE.syncQueue, "bySessionId", sessionId);
        return filterListed(inAccountScope(rows, ctx.accountScope), options).sort((a, b) =>
          a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
        );
      });
    },

    /** Pending and expired leased items only. Terminal failed rows require manual retry. */
    async listRunnable(now = new Date()): Promise<SyncQueueItem[]> {
      return withStoreError("syncQueue.listRunnable", async () => {
        const rows = await ctx.db.getAll(STORE.syncQueue);
        const nowMs = now.getTime();
        return rows
          .filter((row) => {
            if (row.deletedAt || !isVisibleInScope(row, ctx.accountScope)) return false;
            const leaseExpired =
              row.syncStatus === "syncing" &&
              Boolean(row.leaseExpiresAt) &&
              Date.parse(row.leaseExpiresAt!) <= nowMs;
            if (row.syncStatus !== "pending" && !leaseExpired) return false;
            if (row.nextRetryAt && Date.parse(row.nextRetryAt) > nowMs) return false;
            return true;
          })
          .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      });
    },

    /** Atomically selects and leases one job. IndexedDB serializes readwrite transactions. */
    async claimNextRunnable(
      workerId: string,
      now = new Date(),
      leaseMs = 30_000,
    ): Promise<SyncQueueItem | null> {
      return withStoreError("syncQueue.claimNextRunnable", async () => {
        if (!workerId) throw new DraftDbError("workerId is required", "invalid_input");
        const tx = ctx.db.transaction(STORE.syncQueue, "readwrite");
        const store = tx.objectStore(STORE.syncQueue);
        const rows = await store.getAll();
        const nowMs = now.getTime();
        const candidate = rows
          .filter((row) => {
            if (row.deletedAt || !isVisibleInScope(row, ctx.accountScope)) return false;
            if (row.nextRetryAt && Date.parse(row.nextRetryAt) > nowMs) return false;
            if (row.syncStatus === "pending") return true;
            return (
              row.syncStatus === "syncing" &&
              Boolean(row.leaseExpiresAt) &&
              Date.parse(row.leaseExpiresAt!) <= nowMs
            );
          })
          .sort((a, b) => {
            const rank = (item: SyncQueueItem) => (item.entityType === "viewingSession" ? 0 : 1);
            return rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt);
          })[0];
        if (!candidate) {
          await tx.done;
          return null;
        }
        const claimed: SyncQueueItem = {
          ...candidate,
          syncStatus: "syncing",
          leaseOwner: workerId,
          leaseExpiresAt: new Date(nowMs + leaseMs).toISOString(),
          updatedAt: now.toISOString(),
          version: candidate.version + 1,
        };
        await store.put(claimed);
        await tx.done;
        return claimed;
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
