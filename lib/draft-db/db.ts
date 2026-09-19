import { deleteDB, openDB, type IDBPDatabase } from "idb";
import { DraftDbError, wrapDraftDbError } from "./errors";
import {
  applyDraftDbMigrations,
  DRAFT_DB_NAME,
  DRAFT_DB_VERSION,
} from "./migrations";
import type { DraftDbSchema } from "./types";

export type DraftDatabase = IDBPDatabase<DraftDbSchema>;

export type OpenDraftDbOptions = {
  /** Override DB name (tests). */
  name?: string;
  /** Target schema version (tests / controlled upgrades). */
  version?: number;
};

let sharedDb: DraftDatabase | null = null;
let sharedDbName = DRAFT_DB_NAME;
let sharedDbVersion = DRAFT_DB_VERSION;
let openPromise: Promise<DraftDatabase> | null = null;

export async function openDraftDatabase(
  options: OpenDraftDbOptions = {},
): Promise<DraftDatabase> {
  const name = options.name ?? DRAFT_DB_NAME;
  const version = options.version ?? DRAFT_DB_VERSION;

  try {
    if (
      sharedDb &&
      sharedDbName === name &&
      sharedDbVersion === version &&
      !options.name &&
      options.version === undefined
    ) {
      return sharedDb;
    }

    // Non-default open (tests): do not reuse the app singleton.
    if (options.name !== undefined || options.version !== undefined) {
      return await openDB<DraftDbSchema>(name, version, {
        upgrade(db, oldVersion, _newVersion, transaction) {
          applyDraftDbMigrations(db, oldVersion, transaction);
        },
        blocked() {
          // Another tab holds an older connection; callers surface via timeout/errors.
        },
        blocking() {
          // Allow upgrades from other connections in tests / multi-tab.
        },
      });
    }

    if (!openPromise) {
      openPromise = openDB<DraftDbSchema>(name, version, {
        upgrade(db, oldVersion, _newVersion, transaction) {
          applyDraftDbMigrations(db, oldVersion, transaction);
        },
      })
        .then((db) => {
          sharedDb = db;
          sharedDbName = name;
          sharedDbVersion = version;
          return db;
        })
        .catch((error) => {
          openPromise = null;
          throw error;
        });
    }

    return await openPromise;
  } catch (error) {
    throw wrapDraftDbError("openDraftDatabase", error);
  }
}

export async function closeDraftDatabase(): Promise<void> {
  try {
    if (sharedDb) {
      sharedDb.close();
      sharedDb = null;
    }
    openPromise = null;
  } catch (error) {
    throw wrapDraftDbError("closeDraftDatabase", error);
  }
}

/** Test helper: wipe a named database. Does not touch production data unless name matches. */
export async function deleteDraftDatabase(name = DRAFT_DB_NAME): Promise<void> {
  try {
    if (sharedDb && sharedDbName === name) {
      sharedDb.close();
      sharedDb = null;
      openPromise = null;
    }
    await deleteDB(name);
  } catch (error) {
    throw new DraftDbError(
      `deleteDraftDatabase failed: ${error instanceof Error ? error.message : String(error)}`,
      "open_failed",
      error,
    );
  }
}
