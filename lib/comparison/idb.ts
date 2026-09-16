import type { ComparisonDraft, ComparisonShareSnapshot } from "./types";

const IDB_NAME = "kanfangji-comparisons";
const IDB_VERSION = 1;

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
      if (!db.objectStoreNames.contains("comparisons")) {
        const store = db.createObjectStore("comparisons", { keyPath: "id" });
        store.createIndex("byUpdatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains("shareSnapshots")) {
        const shares = db.createObjectStore("shareSnapshots", { keyPath: "token" });
        shares.createIndex("byComparisonId", "comparisonId");
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

export async function putComparison(draft: ComparisonDraft): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction("comparisons", "readwrite");
    tx.objectStore("comparisons").put(draft);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function getComparison(id: string): Promise<ComparisonDraft | null> {
  const db = await openDb();
  try {
    const tx = db.transaction("comparisons", "readonly");
    const row = await req<ComparisonDraft | undefined>(
      tx.objectStore("comparisons").get(id),
    );
    await txDone(tx);
    return row ?? null;
  } finally {
    db.close();
  }
}

export async function listComparisons(): Promise<ComparisonDraft[]> {
  const db = await openDb();
  try {
    const tx = db.transaction("comparisons", "readonly");
    const rows = await req<ComparisonDraft[]>(tx.objectStore("comparisons").getAll());
    await txDone(tx);
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    db.close();
  }
}

export type ComparisonShareRecord = {
  token: string;
  comparisonId: string;
  snapshot: ComparisonShareSnapshot;
  createdAt: string;
};

export async function putComparisonShare(record: ComparisonShareRecord): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction("shareSnapshots", "readwrite");
    tx.objectStore("shareSnapshots").put(record);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function getComparisonShare(
  token: string,
): Promise<ComparisonShareRecord | null> {
  const db = await openDb();
  try {
    const tx = db.transaction("shareSnapshots", "readonly");
    const row = await req<ComparisonShareRecord | undefined>(
      tx.objectStore("shareSnapshots").get(token),
    );
    await txDone(tx);
    return row ?? null;
  } finally {
    db.close();
  }
}
