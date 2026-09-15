import { assertImmutableId, createEntityId, nowIso } from "./ids";
import { DraftDbError } from "./errors";
import { STORE } from "./migrations";
import {
  filterListed,
  requireFound,
  withStoreError,
  type RepoContext,
} from "./repository-utils";
import type { CreateNoteInput, ListOptions, Note, UpdateNoteInput } from "./types";

function buildNote(input: CreateNoteInput): Note {
  if (!input.sessionId) {
    throw new DraftDbError("sessionId is required", "invalid_input");
  }
  if (typeof input.body !== "string") {
    throw new DraftDbError("body is required", "invalid_input");
  }
  const timestamp = nowIso();
  return {
    id: input.id ?? createEntityId(),
    sessionId: input.sessionId,
    kind: input.kind ?? "text",
    body: input.body,
    durationSec: input.durationSec ?? null,
    matchedQuestionIds: input.matchedQuestionIds ?? [],
    mediaId: input.mediaId ?? null,
    userId: input.userId ?? null,
    syncStatus: input.syncStatus ?? "local_only",
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: 1,
  };
}

export function createNotesRepository(ctx: RepoContext) {
  return {
    async create(input: CreateNoteInput): Promise<Note> {
      return withStoreError("notes.create", async () => {
        const record = buildNote(input);
        await ctx.db.put(STORE.notes, record);
        return record;
      });
    },

    async get(id: string): Promise<Note | null> {
      return withStoreError("notes.get", async () => {
        if (!id) throw new DraftDbError("id is required", "invalid_input");
        return (await ctx.db.get(STORE.notes, id)) ?? null;
      });
    },

    async require(id: string): Promise<Note> {
      const row = await this.get(id);
      return requireFound(row ?? undefined, "note", id);
    },

    async update(id: string, patch: UpdateNoteInput): Promise<Note> {
      return withStoreError("notes.update", async () => {
        assertImmutableId(id, (patch as { id?: string }).id);
        const existing = requireFound(await ctx.db.get(STORE.notes, id), "note", id);
        const next: Note = {
          ...existing,
          ...patch,
          id: existing.id,
          sessionId: existing.sessionId,
          createdAt: existing.createdAt,
          updatedAt: nowIso(),
          version: existing.version + 1,
        };
        await ctx.db.put(STORE.notes, next);
        return next;
      });
    },

    async softDelete(id: string): Promise<Note> {
      return this.update(id, {
        deletedAt: nowIso(),
        syncStatus: "pending",
      });
    },

    async delete(id: string): Promise<void> {
      return withStoreError("notes.delete", async () => {
        if (!id) throw new DraftDbError("id is required", "invalid_input");
        await ctx.db.delete(STORE.notes, id);
      });
    },

    async list(options?: ListOptions): Promise<Note[]> {
      return withStoreError("notes.list", async () => {
        const rows = await ctx.db.getAll(STORE.notes);
        return filterListed(rows, options).sort((a, b) =>
          a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
        );
      });
    },

    async listBySession(sessionId: string, options?: ListOptions): Promise<Note[]> {
      return withStoreError("notes.listBySession", async () => {
        if (!sessionId) throw new DraftDbError("sessionId is required", "invalid_input");
        const rows = await ctx.db.getAllFromIndex(STORE.notes, "bySessionId", sessionId);
        return filterListed(rows, options).sort((a, b) =>
          a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
        );
      });
    },
  };
}

export type NotesRepository = ReturnType<typeof createNotesRepository>;
