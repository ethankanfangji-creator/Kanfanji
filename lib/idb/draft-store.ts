import {
  ACTIVE_DRAFT_ID,
  IDB_NAME,
  IDB_VERSION,
  MEDIA_QUOTA_BYTES,
  type MediaKind,
  type MediaRecord,
  type ViewingDraftRecord,
} from "./types";
import { getGuestAccountScope, userAccountScope } from "@/lib/draft-db/account-scope";

type StoreName = "meta" | "drafts" | "media";
let activeAccountScope = getGuestAccountScope();

function activeDraftKey(scope = activeAccountScope): string {
  return `${scope}:${ACTIVE_DRAFT_ID}`;
}

function currentSessionPointerKey(scope = activeAccountScope): string {
  return `currentSession:${scope}`;
}

function storedDraftId(draftId = ACTIVE_DRAFT_ID): string {
  return draftId === ACTIVE_DRAFT_ID ? activeDraftKey() : draftId;
}

function publicDraft(record: ViewingDraftRecord | undefined): ViewingDraftRecord | null {
  return record ? { ...record, id: ACTIVE_DRAFT_ID } : null;
}

export function setPersistenceAccountScope(userId: string | null): void {
  activeAccountScope = userId ? userAccountScope(userId) : getGuestAccountScope();
}

export type PersistenceFailureCode =
  | "unsupported"
  | "quota_exceeded"
  | "storage_pressure"
  | "write_failed";
export type PersistenceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: PersistenceFailureCode; message: string; cause?: unknown };

export type LegacyDraftClaimStatus =
  | { status: "none" }
  | {
      status: "available" | "conflict" | "copied" | "verified";
      draft: ViewingDraftRecord;
      mediaCount: number;
    };

type LegacyClaimRecord = {
  key: string;
  value: {
    state: "copied" | "verified";
    sourceDraftId: typeof ACTIVE_DRAFT_ID;
    targetDraftId: string;
    sourceMediaIds?: string[];
    mediaIds: string[];
  };
};

export function requirePersistence<T>(result: PersistenceResult<T>): T {
  if (!result.ok) throw new Error(result.message, { cause: result.cause });
  return result.value;
}

function failure(error: unknown): PersistenceResult<never> {
  const name = error instanceof DOMException ? error.name : "";
  const quota = name === "QuotaExceededError";
  return {
    ok: false,
    code: quota ? "quota_exceeded" : typeof indexedDB === "undefined" ? "unsupported" : "write_failed",
    message: quota ? "裝置儲存空間不足，資料未儲存" : error instanceof Error ? error.message : "本機儲存失敗",
    cause: error,
  };
}

async function storageCanFit(bytes: number): Promise<boolean | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate || estimate.quota == null || estimate.usage == null) return null;
    return estimate.quota - estimate.usage >= bytes;
  } catch {
    return null;
  }
}

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
      const tx = request.transaction;
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      let drafts: IDBObjectStore;
      if (!db.objectStoreNames.contains("drafts")) {
        drafts = db.createObjectStore("drafts", { keyPath: "id" });
      } else {
        drafts = tx!.objectStore("drafts");
      }
      if (!drafts.indexNames.contains("byUpdatedAt")) drafts.createIndex("byUpdatedAt", "updatedAt");
      if (!drafts.indexNames.contains("bySyncStatus")) drafts.createIndex("bySyncStatus", "syncStatus");
      if (!drafts.indexNames.contains("byRemoteId")) {
        drafts.createIndex("byRemoteId", "remoteViewingId", { unique: false });
      }
      let media: IDBObjectStore;
      if (!db.objectStoreNames.contains("media")) {
        media = db.createObjectStore("media", { keyPath: "id" });
      } else {
        media = tx!.objectStore("media");
      }
      if (!media.indexNames.contains("byDraftId")) media.createIndex("byDraftId", "draftId");
      if (!media.indexNames.contains("byKind")) media.createIndex("byKind", "kind");
      if (!media.indexNames.contains("byUploadStatus")) {
        media.createIndex("byUploadStatus", "uploadStatus");
      }
      if (!media.indexNames.contains("byCreatedAt")) media.createIndex("byCreatedAt", "createdAt");
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
    const existing = await req<{ key: string; value: number } | undefined>(
      store.get("schemaVersion"),
    );
    if (existing?.value !== IDB_VERSION) {
      store.put({ key: "schemaVersion", value: IDB_VERSION });
    }
  });
}

export async function getCurrentSessionPointer(): Promise<string | null> {
  const row = await withStore<{ key: string; value: string } | undefined>(
    "meta",
    "readonly",
    (store) => req(store.get(currentSessionPointerKey())),
  );
  return row?.value ?? null;
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
    aiConsent: null,
    pendingAudioProcess: null,
    liveAudioMarkers: [],
    aiSummary: null,
    fieldChecklist: [],
    ...partial,
  };
}

export async function getActiveDraft(): Promise<ViewingDraftRecord | null> {
  await ensureSchemaMeta();
  const db = await openDb();
  try {
    const tx = db.transaction(["drafts", "meta"], "readonly");
    const draftStore = tx.objectStore("drafts");
    const qualified = await req<ViewingDraftRecord | undefined>(
      draftStore.get(activeDraftKey()),
    );
    if (qualified) {
      await txDone(tx);
      return publicDraft(qualified);
    }
    if (!activeAccountScope.startsWith("guest:")) {
      await txDone(tx);
      return null;
    }
    const [legacy, scope] = await Promise.all([
      req<ViewingDraftRecord | undefined>(draftStore.get(ACTIVE_DRAFT_ID)),
      req<{ key: string; value: string } | undefined>(
        tx.objectStore("meta").get("activeDraftScope"),
      ),
    ]);
    await txDone(tx);
    return !scope || scope.value === activeAccountScope ? publicDraft(legacy) : null;
  } finally {
    db.close();
  }
}

export async function putActiveDraft(
  draft: ViewingDraftRecord,
): Promise<PersistenceResult<ViewingDraftRecord>> {
  try {
    await ensureSchemaMeta();
    const next: ViewingDraftRecord = {
      ...draft,
      id: activeDraftKey(),
      updatedAt: new Date().toISOString(),
    };
    const db = await openDb();
    try {
      const tx = db.transaction(["drafts", "meta"], "readwrite");
      const drafts = tx.objectStore("drafts");
      const meta = tx.objectStore("meta");
      drafts.put(next);
      if (next.localSessionId) {
        meta.put({
          key: currentSessionPointerKey(),
          value: next.localSessionId,
          draftId: next.id,
          updatedAt: next.updatedAt,
        });
      }
      if (activeAccountScope.startsWith("guest:")) {
        const legacyScope = await req<{ key: string; value: string } | undefined>(
          meta.get("activeDraftScope"),
        );
        if (!legacyScope || legacyScope.value === activeAccountScope) {
          drafts.delete(ACTIVE_DRAFT_ID);
        }
      }
      await txDone(tx);
    } finally {
      db.close();
    }
    return { ok: true, value: { ...next, id: ACTIVE_DRAFT_ID } };
  } catch (error) {
    return failure(error);
  }
}

export async function clearActiveDraft(): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(["drafts", "media", "meta"], "readwrite");
    const drafts = tx.objectStore("drafts");
    const meta = tx.objectStore("meta");
    const key = activeDraftKey();
    drafts.delete(key);
    meta.delete(currentSessionPointerKey());
    const mediaStore = tx.objectStore("media");
    const index = mediaStore.index("byDraftId");
    const keys = await req(index.getAllKeys(key));
    for (const key of keys) {
      mediaStore.delete(key);
      meta.delete(`mediaScope:${String(key)}`);
    }
    if (activeAccountScope.startsWith("guest:")) {
      const legacyScope = await req<{ key: string; value: string } | undefined>(
        meta.get("activeDraftScope"),
      );
      if (!legacyScope || legacyScope.value === activeAccountScope) {
        drafts.delete(ACTIVE_DRAFT_ID);
        meta.delete("activeDraftScope");
        const legacyKeys = await req(index.getAllKeys(ACTIVE_DRAFT_ID));
        for (const legacyKey of legacyKeys) {
          const mediaScope = await req<{ key: string; value: string } | undefined>(
            meta.get(`mediaScope:${String(legacyKey)}`),
          );
          if (!mediaScope || mediaScope.value === activeAccountScope) {
            mediaStore.delete(legacyKey);
            meta.delete(`mediaScope:${String(legacyKey)}`);
          }
        }
      }
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function listMedia(draftId = ACTIVE_DRAFT_ID): Promise<MediaRecord[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(["media", "meta"], "readonly");
    const index = tx.objectStore("media").index("byDraftId");
    const rows = await req<MediaRecord[]>(index.getAll(storedDraftId(draftId)));
    if (draftId === ACTIVE_DRAFT_ID && activeAccountScope.startsWith("guest:")) {
      rows.push(...await req<MediaRecord[]>(index.getAll(ACTIVE_DRAFT_ID)));
    }
    const visible: MediaRecord[] = [];
    for (const row of rows) {
      const scope = await req<{ key: string; value: string } | undefined>(
        tx.objectStore("meta").get(`mediaScope:${row.id}`),
      );
      if (
        scope?.value === activeAccountScope ||
        (!scope && activeAccountScope.startsWith("guest:"))
      ) visible.push(row);
    }
    await txDone(tx);
    return visible;
  } finally {
    db.close();
  }
}

export async function getMedia(id: string): Promise<MediaRecord | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(["media", "meta"], "readonly");
    const [row, scope] = await Promise.all([
      req<MediaRecord | undefined>(tx.objectStore("media").get(id)),
      req<{ key: string; value: string } | undefined>(
        tx.objectStore("meta").get(`mediaScope:${id}`),
      ),
    ]);
    await txDone(tx);
    const visible =
      scope?.value === activeAccountScope ||
      (!scope && activeAccountScope.startsWith("guest:"));
    return visible ? row ?? null : null;
  } finally {
    db.close();
  }
}

export async function putMedia(record: MediaRecord): Promise<PersistenceResult<MediaRecord>> {
  try {
    const existing = await getMedia(record.id);
    const addedBytes =
      Math.max(0, record.blob.size - (existing?.blob.size ?? 0)) +
      Math.max(0, (record.thumbBlob?.size ?? 0) - (existing?.thumbBlob?.size ?? 0));
    const quota = await enforceMediaQuota(Math.max(0, addedBytes));
    if (quota.bytes + addedBytes > MEDIA_QUOTA_BYTES) {
      return {
        ok: false,
        code: "storage_pressure",
        message: "裝置儲存空間不足，媒體未儲存",
      };
    }
    const canFit = await storageCanFit(addedBytes);
    if (canFit === false) {
      return {
        ok: false,
        code: "storage_pressure",
        message: "裝置儲存空間不足，媒體未儲存",
      };
    }
    const db = await openDb();
    try {
      const tx = db.transaction(["media", "meta"], "readwrite");
      const mediaStore = tx.objectStore("media");
      const metaStore = tx.objectStore("meta");
      const [rawExisting, existingScope] = await Promise.all([
        req<MediaRecord | undefined>(mediaStore.get(record.id)),
        req<{ key: string; value: string } | undefined>(
          metaStore.get(`mediaScope:${record.id}`),
        ),
      ]);
      if (
        rawExisting &&
        existingScope?.value !== activeAccountScope &&
        !(!existingScope && activeAccountScope.startsWith("guest:"))
      ) {
        throw new Error("媒體屬於另一個帳戶");
      }
      const next = {
        ...record,
        draftId: storedDraftId(record.draftId),
      };
      mediaStore.put(next);
      metaStore.put({ key: `mediaScope:${record.id}`, value: activeAccountScope });
      await txDone(tx);
    } finally {
      db.close();
    }
    await enforceMediaQuota();
    return { ok: true, value: record };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteMedia(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(["media", "meta"], "readwrite");
    const meta = tx.objectStore("meta");
    const scope = await req<{ key: string; value: string } | undefined>(
      meta.get(`mediaScope:${id}`),
    );
    if (scope?.value === activeAccountScope || (!scope && activeAccountScope.startsWith("guest:"))) {
      tx.objectStore("media").delete(id);
      meta.delete(`mediaScope:${id}`);
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}

function legacyClaimKey(scope: string): string {
  return `legacyDraftClaim:${scope}`;
}

function claimedMediaId(scope: string, legacyId: string): string {
  return `${scope}:media:${legacyId}`;
}

function rewriteMediaReferences(value: unknown, mediaIds: Map<string, string>): unknown {
  if (typeof value === "string") return mediaIds.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => rewriteMediaReferences(item, mediaIds));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewriteMediaReferences(item, mediaIds)]),
    );
  }
  return value;
}

/**
 * Finds the v1 active draft whose owner cannot be established. Authenticated callers may
 * offer recovery, but must not display its contents as the current scoped draft.
 */
export async function discoverLegacyUnscopedDraft(userId: string): Promise<LegacyDraftClaimStatus> {
  const nextScope = userAccountScope(userId);
  const db = await openDb();
  try {
    const tx = db.transaction(["drafts", "media", "meta"], "readonly");
    const drafts = tx.objectStore("drafts");
    const media = tx.objectStore("media");
    const meta = tx.objectStore("meta");
    const [source, sourceScope, target, claim] = await Promise.all([
      req<ViewingDraftRecord | undefined>(drafts.get(ACTIVE_DRAFT_ID)),
      req<{ key: string; value: string } | undefined>(meta.get("activeDraftScope")),
      req<ViewingDraftRecord | undefined>(drafts.get(activeDraftKey(nextScope))),
      req<LegacyClaimRecord | undefined>(meta.get(legacyClaimKey(nextScope))),
    ]);
    if (!source || sourceScope) {
      await txDone(tx);
      return { status: "none" };
    }
    const legacyMedia = await req<MediaRecord[]>(media.index("byDraftId").getAll(ACTIVE_DRAFT_ID));
    let mediaCount = 0;
    for (const row of legacyMedia) {
      const scope = await req<{ key: string; value: string } | undefined>(
        meta.get(`mediaScope:${row.id}`),
      );
      if (!scope) mediaCount += 1;
    }
    await txDone(tx);
    return {
      status: claim?.value.state ?? (target ? "conflict" : "available"),
      draft: publicDraft(source)!,
      mediaCount,
    };
  } finally {
    db.close();
  }
}

/**
 * Explicitly copies an unscoped v1 draft and its media into an authenticated scope.
 * The source is retained until final verification. A committed-but-unverified copy is safe
 * to resume; successful verification atomically removes the guest-visible source.
 */
export async function claimLegacyUnscopedDraft(
  userId: string,
  options: { deferVerification?: boolean } = {},
): Promise<LegacyDraftClaimStatus> {
  const nextScope = userAccountScope(userId);
  const db = await openDb();
  try {
    const tx = db.transaction(["drafts", "media", "meta"], "readwrite");
    const drafts = tx.objectStore("drafts");
    const media = tx.objectStore("media");
    const meta = tx.objectStore("meta");
    const userKey = activeDraftKey(nextScope);
    const [source, sourceScope, target, existingClaim] = await Promise.all([
      req<ViewingDraftRecord | undefined>(drafts.get(ACTIVE_DRAFT_ID)),
      req<{ key: string; value: string } | undefined>(meta.get("activeDraftScope")),
      req<ViewingDraftRecord | undefined>(drafts.get(userKey)),
      req<LegacyClaimRecord | undefined>(meta.get(legacyClaimKey(nextScope))),
    ]);
    if (!source || sourceScope) {
      await txDone(tx);
      return { status: "none" };
    }
    const legacyRows = await req<MediaRecord[]>(media.index("byDraftId").getAll(ACTIVE_DRAFT_ID));
    const unscopedRows: MediaRecord[] = [];
    for (const row of legacyRows) {
      const scope = await req<{ key: string; value: string } | undefined>(
        meta.get(`mediaScope:${row.id}`),
      );
      if (!scope) unscopedRows.push(row);
    }
    if (target && !existingClaim) {
      await txDone(tx);
      return {
        status: "conflict",
        draft: publicDraft(source)!,
        mediaCount: unscopedRows.length,
      };
    }
    const mediaIds = new Map(
      unscopedRows.map((row) => [row.id, claimedMediaId(nextScope, row.id)]),
    );
    if (!target) {
      const copiedDraft = rewriteMediaReferences(source, mediaIds) as ViewingDraftRecord;
      drafts.put({ ...copiedDraft, id: userKey });
      for (const row of unscopedRows) {
        const id = mediaIds.get(row.id)!;
        media.put({ ...row, id, draftId: userKey });
        meta.put({ key: `mediaScope:${id}`, value: nextScope });
      }
      meta.put({
        key: legacyClaimKey(nextScope),
        value: {
          state: "copied",
          sourceDraftId: ACTIVE_DRAFT_ID,
          targetDraftId: userKey,
          sourceMediaIds: [...mediaIds.keys()],
          mediaIds: [...mediaIds.values()],
        },
      } satisfies LegacyClaimRecord);
    }
    await txDone(tx);
  } finally {
    db.close();
  }
  if (options.deferVerification) {
    return discoverLegacyUnscopedDraft(userId);
  }
  return verifyLegacyUnscopedDraftClaim(userId);
}

export async function verifyLegacyUnscopedDraftClaim(
  userId: string,
): Promise<LegacyDraftClaimStatus> {
  const nextScope = userAccountScope(userId);
  const db = await openDb();
  try {
    const tx = db.transaction(["drafts", "media", "meta"], "readwrite");
    const drafts = tx.objectStore("drafts");
    const media = tx.objectStore("media");
    const meta = tx.objectStore("meta");
    const [source, claim] = await Promise.all([
      req<ViewingDraftRecord | undefined>(drafts.get(ACTIVE_DRAFT_ID)),
      req<LegacyClaimRecord | undefined>(meta.get(legacyClaimKey(nextScope))),
    ]);
    if (!source || !claim) {
      await txDone(tx);
      return { status: "none" };
    }
    const target = await req<ViewingDraftRecord | undefined>(drafts.get(claim.value.targetDraftId));
    const sourceMediaIds =
      claim.value.sourceMediaIds ??
      claim.value.mediaIds.map((id) => id.replace(`${nextScope}:media:`, ""));
    const sourceRows = await req<MediaRecord[]>(
      media.index("byDraftId").getAll(claim.value.sourceDraftId),
    );
    const unscopedSourceRows: MediaRecord[] = [];
    for (const row of sourceRows) {
      const scope = await req<{ key: string; value: string } | undefined>(
        meta.get(`mediaScope:${row.id}`),
      );
      if (!scope) unscopedSourceRows.push(row);
    }
    const copiedMedia = await Promise.all(
      claim.value.mediaIds.map(async (id) => {
        const [row, scope] = await Promise.all([
          req<MediaRecord | undefined>(media.get(id)),
          req<{ key: string; value: string } | undefined>(meta.get(`mediaScope:${id}`)),
        ]);
        return { row, scope };
      }),
    );
    const allSourceRowsAccountedFor =
      unscopedSourceRows.length === sourceMediaIds.length &&
      unscopedSourceRows.every((row) => sourceMediaIds.includes(row.id));
    const allCopiesVerified =
      copiedMedia.length === sourceMediaIds.length &&
      copiedMedia.every(
        ({ row, scope }) =>
          row?.draftId === claim.value.targetDraftId && scope?.value === nextScope,
      );
    if (!target || !allSourceRowsAccountedFor || !allCopiesVerified) {
      await txDone(tx);
      return {
        status: "copied",
        draft: publicDraft(source)!,
        mediaCount: claim.value.mediaIds.length,
      };
    }
    drafts.delete(claim.value.sourceDraftId);
    for (const sourceMediaId of sourceMediaIds) {
      media.delete(sourceMediaId);
      meta.delete(`mediaScope:${sourceMediaId}`);
    }
    meta.delete("activeDraftScope");
    meta.put({
      ...claim,
      value: { ...claim.value, state: "verified" },
    } satisfies LegacyClaimRecord);
    await txDone(tx);
    activeAccountScope = nextScope;
    return {
      status: "verified",
      draft: publicDraft(source)!,
      mediaCount: claim.value.mediaIds.length,
    };
  } finally {
    db.close();
  }
}

/**
 * Transfers this installation's already-scoped guest draft after a login. Legacy unscoped
 * rows are intentionally excluded and require `claimLegacyUnscopedDraft`.
 */
export async function claimCanonicalGuestData(userId: string): Promise<void> {
  const guestScope = getGuestAccountScope();
  const nextScope = userAccountScope(userId);
  const db = await openDb();
  try {
    const tx = db.transaction(["drafts", "media", "meta"], "readwrite");
    const drafts = tx.objectStore("drafts");
    const media = tx.objectStore("media");
    const meta = tx.objectStore("meta");
    const guestKey = activeDraftKey(guestScope);
    const userKey = activeDraftKey(nextScope);
    const [source, target] = await Promise.all([
      req<ViewingDraftRecord | undefined>(drafts.get(guestKey)),
      req<ViewingDraftRecord | undefined>(drafts.get(userKey)),
    ]);
    if (!target) {
      if (source) drafts.put({ ...source, id: userKey });
      const rows = await req<MediaRecord[]>(media.index("byDraftId").getAll(guestKey));
      for (const row of rows) {
        const scope = await req<{ key: string; value: string } | undefined>(
          meta.get(`mediaScope:${row.id}`),
        );
        if (scope?.value === guestScope) {
          media.put({ ...row, draftId: userKey });
          meta.put({ key: `mediaScope:${row.id}`, value: nextScope });
        }
      }
      if (source) drafts.delete(guestKey);
    }
    const claimedDraft = target ?? source;
    if (claimedDraft?.localSessionId) {
      meta.put({
        key: currentSessionPointerKey(nextScope),
        value: claimedDraft.localSessionId,
        draftId: userKey,
        updatedAt: claimedDraft.updatedAt,
      });
    }
    meta.delete(currentSessionPointerKey(guestScope));
    await txDone(tx);
    activeAccountScope = nextScope;
  } finally {
    db.close();
  }
}

export async function totalMediaBytes(draftId = ACTIVE_DRAFT_ID): Promise<number> {
  const rows = await listMedia(draftId);
  return rows.reduce((sum, row) => sum + row.blob.size + (row.thumbBlob?.size || 0), 0);
}

/**
 * Prefer deleting oldest already-uploaded blobs first; never delete `local`/`failed`
 * unless still over quota (then oldest first).
 */
export async function enforceMediaQuota(
  requiredBytes = 0,
): Promise<{ evicted: number; bytes: number }> {
  let rows = await listMedia();
  let bytes = rows.reduce((sum, row) => sum + row.blob.size + (row.thumbBlob?.size ?? 0), 0);
  if (bytes + requiredBytes <= MEDIA_QUOTA_BYTES) return { evicted: 0, bytes };

  const thumbnails = rows
    .filter((r) => Boolean(r.thumbBlob))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let evicted = 0;
  for (const row of thumbnails) {
    if (bytes + requiredBytes <= MEDIA_QUOTA_BYTES) break;
    const freed = row.thumbBlob?.size ?? 0;
    await withStore("media", "readwrite", (store) =>
      req(store.put({ ...row, thumbBlob: null, thumbMimeType: null })),
    );
    bytes -= freed;
    evicted += 1;
  }

  if (bytes + requiredBytes > MEDIA_QUOTA_BYTES) {
    rows = await listMedia();
    const uploaded = rows
      .filter((r) => r.uploadStatus === "uploaded" && Boolean(r.remotePath) && !r.bodyEvicted)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const row of uploaded) {
      if (bytes + requiredBytes <= MEDIA_QUOTA_BYTES) break;
      const freed = row.blob.size;
      await withStore("media", "readwrite", (store) =>
        req(store.put({ ...row, blob: new Blob([], { type: row.mimeType }), bodyEvicted: true })),
      );
      bytes -= freed;
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
  tagId?: string;
  note?: string;
  thumbBlob?: Blob | null;
  thumbMimeType?: string | null;
}): Promise<PersistenceResult<MediaRecord>> {
  const record: MediaRecord = {
    id: newMediaId(),
    draftId: input.draftId ?? ACTIVE_DRAFT_ID,
    kind: input.kind,
    label: input.label,
    tagId: input.tagId,
    note: input.note ?? "",
    mimeType: input.blob.type || "application/octet-stream",
    size: input.blob.size,
    createdAt: new Date().toISOString(),
    blob: input.blob,
    thumbBlob: input.thumbBlob ?? null,
    thumbMimeType: input.thumbMimeType ?? null,
    remotePath: null,
    uploadStatus: "local",
    clientNumericId: input.clientNumericId,
  };
  return putMedia(record);
}

export async function updateMediaFields(
  id: string,
  patch: Partial<
    Pick<
      MediaRecord,
      | "label"
      | "tagId"
      | "note"
      | "thumbBlob"
      | "thumbMimeType"
      | "uploadStatus"
      | "remotePath"
      | "markers"
    >
  >,
): Promise<PersistenceResult<MediaRecord | null>> {
  const existing = await getMedia(id);
  if (!existing) return { ok: true, value: null };
  const next: MediaRecord = { ...existing, ...patch };
  return putMedia(next);
}
