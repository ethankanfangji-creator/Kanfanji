/**
 * Local media library for Viewing Chat (photos / videos / files).
 * Blobs live in IndexedDB; metadata is listed for the UI.
 */

export type MediaKind = "image" | "video" | "file";

export type MediaLibraryItem = {
  id: string;
  name: string;
  mime: string;
  kind: MediaKind;
  size: number;
  createdAt: string;
  threadId: string | null;
  /** Object URL for preview — revoke when disposing */
  url?: string;
};

const DB_NAME = "kanfangji.mediaLibrary";
const DB_VERSION = 1;
const STORE = "files";

function kindFromMime(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb_open_failed"));
  });
}

type StoredRow = {
  id: string;
  name: string;
  mime: string;
  kind: MediaKind;
  size: number;
  createdAt: string;
  threadId: string | null;
  blob: Blob;
};

export async function listMediaLibrary(): Promise<MediaLibraryItem[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as StoredRow[]).map((row) => ({
        id: row.id,
        name: row.name,
        mime: row.mime,
        kind: row.kind,
        size: row.size,
        createdAt: row.createdAt,
        threadId: row.threadId,
        url: URL.createObjectURL(row.blob),
      }));
      rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      resolve(rows);
    };
    req.onerror = () => reject(req.error ?? new Error("idb_list_failed"));
  });
}

export async function addMediaFile(
  file: File,
  threadId: string | null = null,
): Promise<MediaLibraryItem> {
  const db = await openDb();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `media_${Date.now()}`;
  const row: StoredRow = {
    id,
    name: file.name || "upload",
    mime: file.type || "application/octet-stream",
    kind: kindFromMime(file.type || ""),
    size: file.size,
    createdAt: new Date().toISOString(),
    threadId,
    blob: file,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb_put_failed"));
  });
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    kind: row.kind,
    size: row.size,
    createdAt: row.createdAt,
    threadId: row.threadId,
    url: URL.createObjectURL(file),
  };
}

export async function removeMediaFile(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb_delete_failed"));
  });
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
