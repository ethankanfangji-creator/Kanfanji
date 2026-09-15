import {
  ACTIVE_DRAFT_ID,
  IDB_NAME,
  IDB_VERSION,
  MEDIA_QUOTA_BYTES,
  type MediaKind,
  type MediaRecord,
  type ViewingDraftRecord,
} from "./types";

type StoreName = "meta" | "drafts" | "media";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("此瀏覽器不支援 IndexedDB"));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 開啟失敗"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("drafts")) {
        const drafts = db.createObjectStore("drafts", { keyPath: "id" });
        drafts.createIndex("byUpdatedAt", "updatedAt");
        drafts.createIndex("bySyncStatus", "syncStatus");
        drafts.createIndex("byRemoteId", "remoteViewingId", { unique: false });
      }
      if (!db.objectStoreNames.contains("media")) {
        const media = db.createObjectStore("media", { keyPath: "id" });
        media.createIndex("byDraftId", "draftId");
        media.createIndex("byKind", "kind");
        media.createIndex("byUploadStatus", "uploadStatus");
        media.createIndex("byCreatedAt", "createdAt");
      }
    };
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

async function withStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    // Keep requests on the same tick as tx creation; then wait for completion.
    const resultPromise = Promise.resolve(fn(store));
    const result = await resultPromise;
    await txDone(tx);
    return result;
  } finally {
    db.close();
  }
}

export async function getSchemaVersion(): Promise<number> {
  const row = await withStore<{ key: string; value: number } | undefined>("meta", "readonly", (store) =>
    req(store.get("schemaVersion")),
  );
  return row?.value ?? 1;
}

export async function ensureSchemaMeta(): Promise<void> {
  await withStore("meta", "readwrite", async (store) => {
    const existing = await req(store.get("schemaVersion"));
    if (!existing) {
      store.put({ key: "schemaVersion", value: IDB_VERSION });
    }
  });
}

export function emptyDraft(partial?: Partial<ViewingDraftRecord>): ViewingDraftRecord {
  const now = new Date().toISOString();
  return {
    id: ACTIVE_DRAFT_ID,
    localSessionId: null,
    remoteViewingId: null,
    shareToken: null,
    address: "",
    tags: [],
    market: "CA",
    identified: false,
    questions: [],
    notes: [],
    pros: [],
    risks: [],
    propertyDraft: {},
    syncStatus: "local_only",
    lastError: null,
    clientUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
    wizardStep: 1,
    viewingAt: "",
    unitLabel: "",
    priceLabel: "",
    layoutLabel: "",
    listingUrl: "",
    setupNotes: "",
    ...partial,
  };
}

export async function getActiveDraft(): Promise<ViewingDraftRecord | null> {
  await ensureSchemaMeta();
  return withStore("drafts", "readonly", (store) => req(store.get(ACTIVE_DRAFT_ID)));
}

export async function putActiveDraft(draft: ViewingDraftRecord): Promise<void> {
  await ensureSchemaMeta();
  const next: ViewingDraftRecord = {
    ...draft,
    id: ACTIVE_DRAFT_ID,
    updatedAt: new Date().toISOString(),
  };
  await withStore("drafts", "readwrite", async (store) => {
    store.put(next);
  });
}

export async function clearActiveDraft(): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(["drafts", "media"], "readwrite");
    tx.objectStore("drafts").delete(ACTIVE_DRAFT_ID);
    const mediaStore = tx.objectStore("media");
    const index = mediaStore.index("byDraftId");
    const keys = await req(index.getAllKeys(ACTIVE_DRAFT_ID));
    for (const key of keys) {
      mediaStore.delete(key);
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function listMedia(draftId = ACTIVE_DRAFT_ID): Promise<MediaRecord[]> {
  return withStore("media", "readonly", async (store) => {
    const index = store.index("byDraftId");
    return req(index.getAll(draftId));
  });
}

export async function getMedia(id: string): Promise<MediaRecord | null> {
  const row = await withStore<MediaRecord | undefined>("media", "readonly", (store) => req(store.get(id)));
  return row ?? null;
}

export async function putMedia(record: MediaRecord): Promise<void> {
  await withStore("media", "readwrite", async (store) => {
    store.put(record);
  });
  await enforceMediaQuota();
}

export async function deleteMedia(id: string): Promise<void> {
  await withStore("media", "readwrite", async (store) => {
    store.delete(id);
  });
}

export async function totalMediaBytes(draftId = ACTIVE_DRAFT_ID): Promise<number> {
  const rows = await listMedia(draftId);
  return rows.reduce((sum, row) => sum + (row.size || 0), 0);
}

/**
 * Prefer deleting oldest already-uploaded blobs first; never delete `local`/`failed`
 * unless still over quota (then oldest first).
 */
export async function enforceMediaQuota(): Promise<{ evicted: number; bytes: number }> {
  let rows = await listMedia();
  let bytes = rows.reduce((sum, row) => sum + (row.size || 0), 0);
  if (bytes <= MEDIA_QUOTA_BYTES) return { evicted: 0, bytes };

  const uploaded = rows
    .filter((r) => r.uploadStatus === "uploaded")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let evicted = 0;

  for (const row of uploaded) {
    if (bytes <= MEDIA_QUOTA_BYTES) break;
    await deleteMedia(row.id);
    bytes -= row.size;
    evicted += 1;
  }

  if (bytes > MEDIA_QUOTA_BYTES) {
    rows = await listMedia();
    const rest = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const row of rest) {
      if (bytes <= MEDIA_QUOTA_BYTES) break;
      await deleteMedia(row.id);
      bytes -= row.size;
      evicted += 1;
    }
  }

  return { evicted, bytes };
}

export function newMediaId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveBlobAsMedia(input: {
  kind: MediaKind;
  label: string;
  blob: Blob;
  clientNumericId: number;
  draftId?: string;
}): Promise<MediaRecord> {
  const record: MediaRecord = {
    id: newMediaId(),
    draftId: input.draftId ?? ACTIVE_DRAFT_ID,
    kind: input.kind,
    label: input.label,
    mimeType: input.blob.type || "application/octet-stream",
    size: input.blob.size,
    createdAt: new Date().toISOString(),
    blob: input.blob,
    remotePath: null,
    uploadStatus: "local",
    clientNumericId: input.clientNumericId,
  };
  await putMedia(record);
  return record;
}
