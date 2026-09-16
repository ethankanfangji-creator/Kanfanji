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
import type { CreateMediaInput, ListOptions, MediaItem, UpdateMediaInput } from "./types";

function buildMedia(input: CreateMediaInput, defaultScope?: string): MediaItem {
  if (!input.sessionId) {
    throw new DraftDbError("sessionId is required", "invalid_input");
  }
  if (!(input.blob instanceof Blob) && !input.mediaRefId) {
    throw new DraftDbError("blob or mediaRefId is required", "invalid_input");
  }
  if (!input.kind) {
    throw new DraftDbError("kind is required", "invalid_input");
  }

  const timestamp = nowIso();
  return {
    id: input.id ?? createEntityId(),
    accountScope: input.accountScope ?? defaultScope ?? "guest:legacy",
    sessionId: input.sessionId,
    kind: input.kind,
    mimeType: input.mimeType || input.blob?.type || "application/octet-stream",
    size: input.size ?? input.blob?.size ?? 0,
    label: input.label ?? null,
    tag: input.tag ?? null,
    durationSec: input.durationSec ?? null,
    blob: input.blob ?? null,
    mediaRefId: input.mediaRefId ?? null,
    remoteUrl: input.remoteUrl ?? null,
    storagePath: input.storagePath ?? null,
    uploadStatus: input.uploadStatus ?? "local",
    userId: input.userId ?? null,
    syncStatus: input.syncStatus ?? "local_only",
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: 1,
  };
}

export function createMediaRepository(ctx: RepoContext) {
  return {
    async create(input: CreateMediaInput): Promise<MediaItem> {
      return withStoreError("media.create", async () => {
        const record = buildMedia(input, ctx.accountScope);
        await ctx.db.put(STORE.media, record);
        return record;
      });
    },

    async get(id: string): Promise<MediaItem | null> {
      return withStoreError("media.get", async () => {
        if (!id) throw new DraftDbError("id is required", "invalid_input");
        const row = await ctx.db.get(STORE.media, id);
        return isVisibleInScope(row, ctx.accountScope) ? row ?? null : null;
      });
    },

    async require(id: string): Promise<MediaItem> {
      const row = await this.get(id);
      return requireFound(row ?? undefined, "media", id);
    },

    async update(id: string, patch: UpdateMediaInput): Promise<MediaItem> {
      return withStoreError("media.update", async () => {
        assertImmutableId(id, (patch as { id?: string }).id);
        const existing = requireFound(await ctx.db.get(STORE.media, id), "media", id);
        if (!isVisibleInScope(existing, ctx.accountScope)) {
          throw new DraftDbError("media is locked to another account", "not_found");
        }
        const nextBlob = patch.blob === undefined ? existing.blob : patch.blob;
        const nextRef = patch.mediaRefId === undefined ? existing.mediaRefId : patch.mediaRefId;
        if (!(nextBlob instanceof Blob) && !nextRef) {
          throw new DraftDbError("blob or mediaRefId is required", "invalid_input");
        }
        const next: MediaItem = {
          ...existing,
          ...patch,
          id: existing.id,
          sessionId: existing.sessionId,
          blob: nextBlob,
          mediaRefId: nextRef,
          mimeType: patch.mimeType ?? (nextBlob?.type || existing.mimeType),
          size: patch.size ?? nextBlob?.size ?? existing.size,
          createdAt: existing.createdAt,
          updatedAt: nowIso(),
          version: existing.version + 1,
        };
        await ctx.db.put(STORE.media, next);
        return next;
      });
    },

    async softDelete(id: string): Promise<MediaItem> {
      return this.update(id, {
        deletedAt: nowIso(),
        syncStatus: "pending",
      });
    },

    async delete(id: string): Promise<void> {
      return withStoreError("media.delete", async () => {
        if (!id) throw new DraftDbError("id is required", "invalid_input");
        const existing = await ctx.db.get(STORE.media, id);
        if (!isVisibleInScope(existing, ctx.accountScope)) {
          throw new DraftDbError("media is locked to another account", "not_found");
        }
        await ctx.db.delete(STORE.media, id);
      });
    },

    async list(options?: ListOptions): Promise<MediaItem[]> {
      return withStoreError("media.list", async () => {
        const rows = await ctx.db.getAll(STORE.media);
        return filterListed(inAccountScope(rows, ctx.accountScope), options).sort((a, b) =>
          a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
        );
      });
    },

    async listBySession(sessionId: string, options?: ListOptions): Promise<MediaItem[]> {
      return withStoreError("media.listBySession", async () => {
        if (!sessionId) throw new DraftDbError("sessionId is required", "invalid_input");
        const rows = await ctx.db.getAllFromIndex(STORE.media, "bySessionId", sessionId);
        return filterListed(inAccountScope(rows, ctx.accountScope), options).sort((a, b) =>
          a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
        );
      });
    },
  };
}

export type MediaRepository = ReturnType<typeof createMediaRepository>;
