import type { IDBPDatabase, IDBPTransaction } from "idb";
import type { DraftDbSchema } from "./types";

export const DRAFT_DB_NAME = "kanfangji-drafts";

/** Bump only when adding additive upgrades in `applyDraftDbMigrations`. */
export const DRAFT_DB_VERSION = 2;

export const STORE = {
  viewingSessions: "viewingSessions",
  notes: "notes",
  media: "media",
  syncQueue: "syncQueue",
} as const;

type VersionChangeTx = IDBPTransaction<
  DraftDbSchema,
  ArrayLike<keyof DraftDbSchema>,
  "versionchange"
>;

/**
 * Safe, additive migrations only.
 * Never delete object stores or clear records during upgrade.
 */
export function applyDraftDbMigrations(
  db: IDBPDatabase<DraftDbSchema>,
  oldVersion: number,
  transaction: VersionChangeTx,
): void {
  if (oldVersion < 1) {
    migrateToV1(db);
  }
  if (oldVersion < 2) {
    migrateToV2(transaction);
  }
}

function migrateToV1(db: IDBPDatabase<DraftDbSchema>): void {
  if (!db.objectStoreNames.contains(STORE.viewingSessions)) {
    const sessions = db.createObjectStore(STORE.viewingSessions, { keyPath: "id" });
    sessions.createIndex("byUpdatedAt", "updatedAt");
    sessions.createIndex("bySyncStatus", "syncStatus");
    sessions.createIndex("byUserId", "userId");
    sessions.createIndex("byDeletedAt", "deletedAt");
  }

  if (!db.objectStoreNames.contains(STORE.notes)) {
    const notes = db.createObjectStore(STORE.notes, { keyPath: "id" });
    notes.createIndex("bySessionId", "sessionId");
    notes.createIndex("bySyncStatus", "syncStatus");
    notes.createIndex("byUpdatedAt", "updatedAt");
    notes.createIndex("byDeletedAt", "deletedAt");
  }

  if (!db.objectStoreNames.contains(STORE.media)) {
    const media = db.createObjectStore(STORE.media, { keyPath: "id" });
    media.createIndex("bySessionId", "sessionId");
    media.createIndex("byKind", "kind");
    media.createIndex("byUploadStatus", "uploadStatus");
    media.createIndex("byUpdatedAt", "updatedAt");
    media.createIndex("byDeletedAt", "deletedAt");
  }

  if (!db.objectStoreNames.contains(STORE.syncQueue)) {
    const queue = db.createObjectStore(STORE.syncQueue, { keyPath: "id" });
    queue.createIndex("bySessionId", "sessionId");
    queue.createIndex("bySyncStatus", "syncStatus");
    queue.createIndex("byNextRetryAt", "nextRetryAt");
    queue.createIndex("byUpdatedAt", "updatedAt");
    queue.createIndex("byDeletedAt", "deletedAt");
  }
}

/** v2: additive index only — preserves all existing rows. */
function migrateToV2(transaction: VersionChangeTx): void {
  const sessions = transaction.objectStore(STORE.viewingSessions);
  if (!sessions.indexNames.contains("byRemoteViewingId")) {
    sessions.createIndex("byRemoteViewingId", "remoteViewingId");
  }
}
