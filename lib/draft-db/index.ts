import {
  closeDraftDatabase,
  deleteDraftDatabase,
  openDraftDatabase,
  type DraftDatabase,
  type OpenDraftDbOptions,
} from "./db";
import { DraftDbError, wrapDraftDbError } from "./errors";
import { STORE } from "./migrations";
import { aiJobId, createAiJobsRepository, type AiJobsRepository } from "./ai-jobs-repo";
import { nowIso } from "./ids";
import { createMediaRepository, type MediaRepository } from "./media-repo";
import { syncQueueItemId } from "./sync-queue-repo";
import { createNotesRepository, type NotesRepository } from "./notes-repo";
import {
  createSyncQueueRepository,
  type SyncQueueRepository,
} from "./sync-queue-repo";
import {
  createViewingSessionsRepository,
  type ViewingSessionsRepository,
} from "./viewing-sessions-repo";
import { getGuestAccountScope } from "./account-scope";

export type ClearSessionMode = "hard" | "soft";

export type ClearSessionResult = {
  sessionId: string;
  notes: number;
  media: number;
  syncQueue: number;
  aiJobs: number;
  mode: ClearSessionMode;
};

export class DraftDb {
  readonly viewingSessions: ViewingSessionsRepository;
  readonly notes: NotesRepository;
  readonly media: MediaRepository;
  readonly syncQueue: SyncQueueRepository;
  readonly aiJobs: AiJobsRepository;

  private constructor(
    readonly db: DraftDatabase,
    readonly accountScope: string,
  ) {
    const ctx = { db, accountScope };
    this.viewingSessions = createViewingSessionsRepository(ctx);
    this.notes = createNotesRepository(ctx);
    this.media = createMediaRepository(ctx);
    this.syncQueue = createSyncQueueRepository(ctx);
    this.aiJobs = createAiJobsRepository(ctx);
  }

  static async open(options?: OpenDraftDbOptions & { accountScope?: string }): Promise<DraftDb> {
    const { accountScope, ...dbOptions } = options ?? {};
    const db = await openDraftDatabase(dbOptions);
    return new DraftDb(db, accountScope ?? getGuestAccountScope());
  }

  /** Explicitly transfers this installation's guest rows to one authenticated account. */
  async claimGuestScope(guestScope: string, userScope: string, userId: string): Promise<number> {
    if (!guestScope.startsWith("guest:") || !userScope.startsWith("user:") || !userId) {
      throw new DraftDbError("invalid guest claim scopes", "invalid_input");
    }
    const tx = this.db.transaction(
      [STORE.viewingSessions, STORE.notes, STORE.media, STORE.syncQueue, STORE.aiJobs],
      "readwrite",
    );
    let claimed = 0;
    for (const storeName of [STORE.viewingSessions, STORE.notes, STORE.media] as const) {
      const store = tx.objectStore(storeName);
      const rows = await store.getAll();
      for (const row of rows) {
        if (
          (row.accountScope && row.accountScope !== guestScope) ||
          (!row.accountScope && row.userId && row.userId !== userId)
        ) continue;
        await store.put({ ...row, accountScope: userScope, userId });
        claimed += 1;
      }
    }
    const queueStore = tx.objectStore(STORE.syncQueue);
    const jobs = await queueStore.getAll();
    for (const row of jobs) {
      if (
        (row.accountScope && row.accountScope !== guestScope) ||
        (!row.accountScope && row.userId && row.userId !== userId)
      ) continue;
      const next = {
        ...row,
        id: syncQueueItemId(row.entityType, row.entityId, row.operation, userScope),
        accountScope: userScope,
        userId,
        leaseOwner: null,
        leaseExpiresAt: null,
      };
      await queueStore.delete(row.id);
      await queueStore.put(next);
      claimed += 1;
    }
    const aiStore = tx.objectStore(STORE.aiJobs);
    const aiJobs = await aiStore.getAll();
    for (const row of aiJobs) {
      if (row.accountScope !== guestScope) continue;
      await aiStore.delete(row.id);
      await aiStore.put({
        ...row,
        id: aiJobId(userScope, row.kind, row.mediaId),
        accountScope: userScope,
        userId,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      claimed += 1;
    }
    await tx.done;
    return claimed;
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

      const session = await this.viewingSessions.require(sessionId);
      const notes = await this.notes.listBySession(sessionId, { includeDeleted: true });
      const media = await this.media.listBySession(sessionId, { includeDeleted: true });
      const queue = await this.syncQueue.listBySession(sessionId, { includeDeleted: true });
      const aiJobs = (await this.aiJobs.list()).filter((job) => job.sessionId === sessionId);

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
        for (const job of aiJobs) {
          if (!job.deletedAt) await this.aiJobs.update(job.id, { deletedAt: nowIso() });
        }
        if (!session.deletedAt) {
          await this.viewingSessions.softDelete(sessionId);
        }
      } else {
        const tx = this.db.transaction(
          [STORE.viewingSessions, STORE.notes, STORE.media, STORE.syncQueue, STORE.aiJobs],
          "readwrite",
        );
        await Promise.all([
          ...notes.map((row) => tx.objectStore(STORE.notes).delete(row.id)),
          ...media.map((row) => tx.objectStore(STORE.media).delete(row.id)),
          ...queue.map((row) => tx.objectStore(STORE.syncQueue).delete(row.id)),
          ...aiJobs.map((row) => tx.objectStore(STORE.aiJobs).delete(row.id)),
          tx.objectStore(STORE.viewingSessions).delete(sessionId),
          tx.done,
        ]);
      }

      return {
        sessionId,
        notes: notes.length,
        media: media.length,
        syncQueue: queue.length,
        aiJobs: aiJobs.length,
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
  accountScopeForUser,
  getGuestAccountScope,
  userAccountScope,
  type AccountScope,
} from "./account-scope";
export {
  applyDraftDbMigrations,
  DRAFT_DB_NAME,
  DRAFT_DB_VERSION,
  STORE,
} from "./migrations";
export type {
  AiJob,
  AiJobKind,
  CreateAiJobInput,
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
