import { deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claimLegacyUnscopedDraft,
  claimCanonicalGuestData,
  clearActiveDraft,
  deleteMedia,
  discoverLegacyUnscopedDraft,
  emptyDraft,
  enforceMediaQuota,
  getActiveDraft,
  getMedia,
  listMedia,
  putMedia,
  putActiveDraft,
  saveBlobAsMedia,
  setPersistenceAccountScope,
  verifyLegacyUnscopedDraftClaim,
} from "./draft-store";
import { ACTIVE_DRAFT_ID, IDB_NAME, IDB_VERSION, MEDIA_QUOTA_BYTES } from "./types";

async function seedV1LegacyDraft(options: { media?: boolean } = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("meta", { keyPath: "key" });
      db.createObjectStore("drafts", { keyPath: "id" });
      const media = db.createObjectStore("media", { keyPath: "id" });
      media.createIndex("byDraftId", "draftId");
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(["drafts", "media"], "readwrite");
      tx.objectStore("drafts").put(
        emptyDraft({
          id: ACTIVE_DRAFT_ID,
          address: "Legacy home",
          pendingAudioProcess: options.media
            ? {
                mediaId: "legacy-audio",
                clientNumericId: 7,
                durationSec: 10,
                createdAt: "2026-01-01T00:00:00Z",
              }
            : null,
        }),
      );
      if (options.media) {
        tx.objectStore("media").put({
          id: "legacy-audio",
          draftId: ACTIVE_DRAFT_ID,
          kind: "audio",
          label: "legacy",
          mimeType: "audio/webm",
          size: 5,
          createdAt: "2026-01-01T00:00:00Z",
          blob: new Blob(["audio"]),
          remotePath: null,
          uploadStatus: "local",
          clientNumericId: 7,
        });
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

beforeEach(async () => {
  setPersistenceAccountScope(null);
  await deleteDB(IDB_NAME);
});

afterEach(async () => {
  setPersistenceAccountScope(null);
  await deleteDB(IDB_NAME);
});

describe("typed IndexedDB durability", () => {
  it("upgrades a v1 database additively and keeps its legacy draft discoverable", async () => {
    await seedV1LegacyDraft();
    setPersistenceAccountScope("user-1");

    expect((await discoverLegacyUnscopedDraft("user-1"))).toMatchObject({
      status: "available",
      draft: { address: "Legacy home" },
    });
    expect(await getActiveDraft()).toBeNull();

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(upgraded.version).toBe(IDB_VERSION);
    expect(upgraded.objectStoreNames.contains("drafts")).toBe(true);
    upgraded.close();
  });

  it("returns a typed quota failure", async () => {
    const original = globalThis.indexedDB;
    const quotaError = new DOMException("full", "QuotaExceededError");
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {
        open() {
          const request: Record<string, unknown> = { error: quotaError };
          queueMicrotask(() => (request.onerror as (() => void) | undefined)?.());
          return request;
        },
      },
    });
    try {
      const result = await saveBlobAsMedia({
        kind: "photo",
        label: "quota",
        blob: new Blob(["x"], { type: "image/jpeg" }),
        clientNumericId: 1,
      });
      expect(result).toMatchObject({ ok: false, code: "quota_exceeded" });
    } finally {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: original,
      });
    }
  });

  it("evicts only thumbnails and uploaded bodies while retaining metadata", async () => {
    const local = {
      id: "local",
      draftId: "active",
      kind: "photo" as const,
      label: "local",
      mimeType: "image/jpeg",
      size: 5,
      createdAt: "2026-01-01T00:00:00Z",
      blob: new Blob(["local"]),
      thumbBlob: new Blob(["thumb"]),
      remotePath: null,
      uploadStatus: "local" as const,
      clientNumericId: 1,
    };
    const uploaded = {
      ...local,
      id: "uploaded",
      label: "uploaded",
      blob: new Blob(["uploaded"]),
      size: 8,
      remotePath: "user/viewing/photos/uploaded.jpg",
      uploadStatus: "uploaded" as const,
      clientNumericId: 2,
    };
    expect((await putMedia(local)).ok).toBe(true);
    expect((await putMedia(uploaded)).ok).toBe(true);

    await enforceMediaQuota(MEDIA_QUOTA_BYTES);

    expect((await getMedia("local"))?.blob.size).toBe(5);
    const retained = await getMedia("uploaded");
    expect(retained).toMatchObject({
      id: "uploaded",
      remotePath: uploaded.remotePath,
      bodyEvicted: true,
      size: 8,
    });
    expect(retained?.blob.size).toBe(0);
  });

  it("rejects an over-quota unsynced write without evicting its body", async () => {
    const blob = new Blob(["local"]);
    Object.defineProperty(blob, "size", { value: MEDIA_QUOTA_BYTES + 1 });
    const result = await putMedia({
      id: "too-large-local",
      draftId: "active",
      kind: "video",
      label: "too large",
      mimeType: "video/webm",
      size: blob.size,
      createdAt: "2026-01-01T00:00:00Z",
      blob,
      remotePath: null,
      uploadStatus: "local",
      clientNumericId: 4,
    });

    expect(result).toMatchObject({ ok: false, code: "storage_pressure" });
    expect(await getMedia("too-large-local")).toBeNull();
  });

  it("claims blob scope by metadata and hides user media after logout", async () => {
    const saved = await saveBlobAsMedia({
      kind: "photo",
      label: "guest",
      blob: new Blob(["private"]),
      clientNumericId: 3,
    });
    expect(saved.ok).toBe(true);
    await claimCanonicalGuestData("user-1");
    setPersistenceAccountScope(null);
    expect(await getMedia(saved.ok ? saved.value.id : "")).toBeNull();
    setPersistenceAccountScope("user-1");
    expect((await getMedia(saved.ok ? saved.value.id : ""))?.label).toBe("guest");
  });

  it("keeps canonical active drafts isolated across authenticated accounts", async () => {
    setPersistenceAccountScope("user-a");
    expect((await putActiveDraft(emptyDraft({ address: "A" }))).ok).toBe(true);
    setPersistenceAccountScope("user-b");
    expect((await putActiveDraft(emptyDraft({ address: "B" }))).ok).toBe(true);
    await clearActiveDraft();
    expect(await getActiveDraft()).toBeNull();
    setPersistenceAccountScope("user-a");
    expect((await getActiveDraft())?.address).toBe("A");
  });

  it("does not let another account delete scoped media", async () => {
    setPersistenceAccountScope("user-a");
    const saved = await saveBlobAsMedia({
      kind: "photo",
      label: "A only",
      blob: new Blob(["private"]),
      clientNumericId: 9,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error("fixture write failed");
    const id = saved.value.id;
    setPersistenceAccountScope("user-b");
    expect(
      (await putMedia({
        ...saved.value,
        id,
        label: "forged overwrite",
      })).ok,
    ).toBe(false);
    await deleteMedia(id);
    setPersistenceAccountScope("user-a");
    expect((await getMedia(id))?.label).toBe("A only");
  });

  it("claims a legacy guest active draft without overwriting an existing user draft", async () => {
    expect((await putActiveDraft(emptyDraft({ address: "Guest" }))).ok).toBe(true);
    await claimCanonicalGuestData("user-1");
    expect((await getActiveDraft())?.address).toBe("Guest");

    setPersistenceAccountScope("user-2");
    expect((await putActiveDraft(emptyDraft({ address: "Existing" }))).ok).toBe(true);
    setPersistenceAccountScope(null);
    expect((await putActiveDraft(emptyDraft({ address: "Later guest" }))).ok).toBe(true);
    await claimCanonicalGuestData("user-2");
    expect((await getActiveDraft())?.address).toBe("Existing");
  });

  it("surfaces legacy data to a signed-in user and requires explicit claim", async () => {
    await seedV1LegacyDraft();
    setPersistenceAccountScope("user-1");
    expect(await getActiveDraft()).toBeNull();
    expect(await discoverLegacyUnscopedDraft("user-1")).toMatchObject({
      status: "available",
      draft: { address: "Legacy home" },
    });

    expect(await claimLegacyUnscopedDraft("user-1")).toMatchObject({ status: "verified" });
    expect((await getActiveDraft())?.address).toBe("Legacy home");
  });

  it("does not overwrite an existing scoped draft during a legacy claim", async () => {
    await seedV1LegacyDraft();
    setPersistenceAccountScope("user-1");
    expect((await putActiveDraft(emptyDraft({ address: "Scoped home" }))).ok).toBe(true);

    expect(await discoverLegacyUnscopedDraft("user-1")).toMatchObject({ status: "conflict" });
    expect(await claimLegacyUnscopedDraft("user-1")).toMatchObject({ status: "conflict" });
    expect((await getActiveDraft())?.address).toBe("Scoped home");
  });

  it("copies legacy media, rewrites references, then hides finalized sources from guests", async () => {
    await seedV1LegacyDraft({ media: true });
    setPersistenceAccountScope("user-1");
    expect(await claimLegacyUnscopedDraft("user-1")).toMatchObject({
      status: "verified",
      mediaCount: 1,
    });

    const draft = await getActiveDraft();
    expect(draft?.pendingAudioProcess?.mediaId).toBe("user:user-1:media:legacy-audio");
    expect((await listMedia()).map((row) => row.id)).toEqual([
      "user:user-1:media:legacy-audio",
    ]);

    setPersistenceAccountScope(null);
    expect(await getActiveDraft()).toBeNull();
    expect(await getMedia("legacy-audio")).toBeNull();
    expect(await listMedia()).toEqual([]);
  });

  it("keeps an interrupted claim recoverable, then finalizes it atomically", async () => {
    await seedV1LegacyDraft({ media: true });
    setPersistenceAccountScope("user-1");
    expect(
      await claimLegacyUnscopedDraft("user-1", { deferVerification: true }),
    ).toMatchObject({ status: "copied" });

    setPersistenceAccountScope(null);
    expect((await getActiveDraft())?.address).toBe("Legacy home");
    expect(await getMedia("legacy-audio")).not.toBeNull();

    setPersistenceAccountScope("user-1");
    expect(await verifyLegacyUnscopedDraftClaim("user-1")).toMatchObject({
      status: "verified",
    });
    expect((await getActiveDraft())?.address).toBe("Legacy home");
    expect(await listMedia()).toHaveLength(1);

    setPersistenceAccountScope(null);
    expect(await getActiveDraft()).toBeNull();
    expect(await getMedia("legacy-audio")).toBeNull();
    expect(await claimLegacyUnscopedDraft("user-1")).toMatchObject({ status: "none" });
  });

  it("keeps finalized source deletion scope-safe after the user clears their copy", async () => {
    await seedV1LegacyDraft({ media: true });
    setPersistenceAccountScope("user-1");
    await claimLegacyUnscopedDraft("user-1");
    await clearActiveDraft();
    expect(await getActiveDraft()).toBeNull();

    setPersistenceAccountScope(null);
    expect(await getActiveDraft()).toBeNull();
    expect(await getMedia("legacy-audio")).toBeNull();
  });
});
