import { assertImmutableId, createEntityId, nowIso } from "./ids";
import { DraftDbError } from "./errors";
import { STORE } from "./migrations";
import {
  filterListed,
  requireFound,
  withStoreError,
  type RepoContext,
} from "./repository-utils";
import type { CreateMediaInput, ListOptions, MediaItem, UpdateMediaInput } from "./types";

function buildMedia(input: CreateMediaInput): MediaItem {
  if (!input.sessionId) {
    throw new DraftDbError("sessionId is required", "invalid_input");
  }
  if (!(input.blob instanceof Blob)) {
    throw new DraftDbError("blob is required and must be a Blob", "invalid_input");
  }
  if (!input.kind) {
    throw new DraftDbError("kind is required", "invalid_input");
  }

  const timestamp = nowIso();
  return {
    id: input.id ?? createEntityId(),
    sessionId: input.sessionId,
    kind: input.kind,
    mimeType: input.mimeType || input.blob.type || "application/octet-stream",
    size: input.blob.size,
    label: input.label ?? null,
    tag: input.tag ?? null,
    durationSec: input.durationSec ?? null,
    blob: input.blob,
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
        const record = buildMedia(input);
        await ctx.db.put(STORE.media, record);
        return record;
      });
    },

    async get(id: string): Promise<MediaItem | null> {
      return withStoreError("media.get", async () => {
        if (!id) throw new DraftDbError("id is required", "invalid_input");
        return (await ctx.db.get(STORE.media, id)) ?? null;
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
        const nextBlob = patch.blob ?? existing.blob;
        if (!(nextBlob instanceof Blob)) {
          throw new DraftDbError("blob must be a Blob", "invalid_input");
        }
        const next: MediaItem = {
          ...existing,
          ...patch,
          id: existing.id,
          sessionId: existing.sessionId,
          blob: nextBlob,
          mimeType: patch.mimeType ?? (nextBlob.type || existing.mimeType),
          size: nextBlob.size,
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
        await ctx.db.delete(STORE.media, id);
      });
    },

    async list(options?: ListOptions): Promise<MediaItem[]> {
      return withStoreError("media.list", async () => {
        const rows = await ctx.db.getAll(STORE.media);
        return filterListed(rows, options).sort((a, b) =>
          a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
        );
      });
    },

    async listBySession(sessionId: string, options?: ListOptions): Promise<MediaItem[]> {
      return withStoreError("media.listBySession", async () => {
        if (!sessionId) throw new DraftDbError("sessionId is required", "invalid_input");
        const rows = await ctx.db.getAllFromIndex(STORE.media, "bySessionId", sessionId);
        return filterListed(rows, options).sort((a, b) =>
          a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
        );
      });
    },
  };
}

export type MediaRepository = ReturnType<typeof createMediaRepository>;
