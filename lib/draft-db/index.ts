import {
  closeDraftDatabase,
  deleteDraftDatabase,
  openDraftDatabase,
  type DraftDatabase,
  type OpenDraftDbOptions,
} from "./db";
import { DraftDbError, wrapDraftDbError } from "./errors";
import { STORE } from "./migrations";
import { createMediaRepository, type MediaRepository } from "./media-repo";
import { createNotesRepository, type NotesRepository } from "./notes-repo";
import {
  createSyncQueueRepository,
  type SyncQueueRepository,
} from "./sync-queue-repo";
import {
  createViewingSessionsRepository,
  type ViewingSessionsRepository,
} from "./viewing-sessions-repo";

export type ClearSessionMode = "hard" | "soft";

export type ClearSessionResult = {
  sessionId: string;
  notes: number;
  media: number;
  syncQueue: number;
  mode: ClearSessionMode;
};

export class DraftDb {
  readonly viewingSessions: ViewingSessionsRepository;
  readonly notes: NotesRepository;
  readonly media: MediaRepository;
  readonly syncQueue: SyncQueueRepository;

  private constructor(readonly db: DraftDatabase) {
    const ctx = { db };
    this.viewingSessions = createViewingSessionsRepository(ctx);
    this.notes = createNotesRepository(ctx);
    this.media = createMediaRepository(ctx);
    this.syncQueue = createSyncQueueRepository(ctx);
  }

  static async open(options?: OpenDraftDbOptions): Promise<DraftDb> {
    const db = await openDraftDatabase(options);
    return new DraftDb(db);
  }

  /**
   * Clears one viewing session and all related notes / media / syncQueue rows.
   * - hard: physically deletes rows (default for local discard)
   * - soft: sets deletedAt for tombstones (future sync)
   */
  async clearSession(
    sessionId: string,
    mode: ClearSessionMode = "hard",
  ): Promise<ClearSessionResult> {
    try {
      if (!sessionId) {
        throw new DraftDbError("sessionId is required", "invalid_input");
      }

      const notes = await this.notes.listBySession(sessionId, { includeDeleted: true });
      const media = await this.media.listBySession(sessionId, { includeDeleted: true });
      const queue = await this.syncQueue.listBySession(sessionId, { includeDeleted: true });

      if (mode === "soft") {
        for (const note of notes) {
          if (!note.deletedAt) await this.notes.softDelete(note.id);
        }
        for (const item of media) {
          if (!item.deletedAt) await this.media.softDelete(item.id);
        }
        for (const item of queue) {
          if (!item.deletedAt) await this.syncQueue.softDelete(item.id);
        }
        const session = await this.viewingSessions.get(sessionId);
        if (session && !session.deletedAt) {
          await this.viewingSessions.softDelete(sessionId);
        }
      } else {
        const tx = this.db.transaction(
          [STORE.viewingSessions, STORE.notes, STORE.media, STORE.syncQueue],
          "readwrite",
        );
        await Promise.all([
          ...notes.map((row) => tx.objectStore(STORE.notes).delete(row.id)),
          ...media.map((row) => tx.objectStore(STORE.media).delete(row.id)),
          ...queue.map((row) => tx.objectStore(STORE.syncQueue).delete(row.id)),
          tx.objectStore(STORE.viewingSessions).delete(sessionId),
          tx.done,
        ]);
      }

      return {
        sessionId,
        notes: notes.length,
        media: media.length,
        syncQueue: queue.length,
        mode,
      };
    } catch (error) {
      throw wrapDraftDbError("clearSession", error);
    }
  }

  close(): void {
    this.db.close();
  }
}

export { closeDraftDatabase, deleteDraftDatabase, openDraftDatabase };
export { DraftDbError } from "./errors";
export type { DraftDbErrorCode } from "./errors";
export { createEntityId } from "./ids";
export {
  applyDraftDbMigrations,
  DRAFT_DB_NAME,
  DRAFT_DB_VERSION,
  STORE,
} from "./migrations";
export type {
  CreateMediaInput,
  CreateNoteInput,
  CreateSyncQueueInput,
  CreateViewingSessionInput,
  DraftDbSchema,
  ListOptions,
  MediaItem,
  MediaKind,
  Note,
  NoteKind,
  SyncEntityType,
  SyncOperation,
  SyncQueueItem,
  SyncStatus,
  UpdateMediaInput,
  UpdateNoteInput,
  UpdateSyncQueueInput,
  UpdateViewingSessionInput,
  UploadStatus,
  ViewingSession,
} from "./types";
