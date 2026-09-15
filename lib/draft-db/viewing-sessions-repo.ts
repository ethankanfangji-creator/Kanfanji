import { assertImmutableId, createEntityId, nowIso } from "./ids";
import { DraftDbError } from "./errors";
import {
  filterListed,
  requireFound,
  withStoreError,
  type RepoContext,
} from "./repository-utils";
import { STORE } from "./migrations";
import type {
  CreateViewingSessionInput,
  ListOptions,
  UpdateViewingSessionInput,
  ViewingSession,
} from "./types";

function buildSession(input: CreateViewingSessionInput): ViewingSession {
  const timestamp = nowIso();
  return {
    id: input.id ?? createEntityId(),
    userId: input.userId ?? null,
    remoteViewingId: input.remoteViewingId ?? null,
    address: input.address ?? "",
    tags: input.tags ?? [],
    market: input.market ?? null,
    questions: input.questions ?? [],
    propertyDraft: input.propertyDraft ?? {},
    identified: input.identified ?? false,
    pros: input.pros ?? [],
    risks: input.risks ?? [],
    lastSyncError: input.lastSyncError ?? null,
    syncStatus: input.syncStatus ?? "local_only",
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: 1,
  };
}

export function createViewingSessionsRepository(ctx: RepoContext) {
  return {
    async create(input: CreateViewingSessionInput = {}): Promise<ViewingSession> {
      return withStoreError("viewingSessions.create", async () => {
        const record = buildSession(input);
        await ctx.db.put(STORE.viewingSessions, record);
        return record;
      });
    },

    async get(id: string): Promise<ViewingSession | null> {
      return withStoreError("viewingSessions.get", async () => {
        if (!id) throw new DraftDbError("id is required", "invalid_input");
        const row = await ctx.db.get(STORE.viewingSessions, id);
        return row ?? null;
      });
    },

    async require(id: string): Promise<ViewingSession> {
      const row = await this.get(id);
      return requireFound(row ?? undefined, "viewingSession", id);
    },

    async update(id: string, patch: UpdateViewingSessionInput): Promise<ViewingSession> {
      return withStoreError("viewingSessions.update", async () => {
        assertImmutableId(id, (patch as { id?: string }).id);
        const existing = requireFound(
          await ctx.db.get(STORE.viewingSessions, id),
          "viewingSession",
          id,
        );
        const next: ViewingSession = {
          ...existing,
          ...patch,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: nowIso(),
          version: existing.version + 1,
        };
        await ctx.db.put(STORE.viewingSessions, next);
        return next;
      });
    },

    async softDelete(id: string): Promise<ViewingSession> {
      return this.update(id, {
        deletedAt: nowIso(),
        syncStatus: "pending",
      });
    },

    async delete(id: string): Promise<void> {
      return withStoreError("viewingSessions.delete", async () => {
        if (!id) throw new DraftDbError("id is required", "invalid_input");
        await ctx.db.delete(STORE.viewingSessions, id);
      });
    },

    async list(options?: ListOptions): Promise<ViewingSession[]> {
      return withStoreError("viewingSessions.list", async () => {
        const rows = await ctx.db.getAllFromIndex(STORE.viewingSessions, "byUpdatedAt");
        return filterListed(rows, options).sort((a, b) =>
          a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
        );
      });
    },
  };
}

export type ViewingSessionsRepository = ReturnType<typeof createViewingSessionsRepository>;
