import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DraftDb, deleteDraftDatabase } from "@/lib/draft-db";
import { createSyncEngine } from "./engine";
import { createMockViewingSyncAdapter } from "./mock-adapter";
import { classifySyncError } from "./errors";
import { decideMerge, syncStatusToUi } from "./merge";

const TEST_DB = "kanfangji-sync-engine-test";
const openHandles: DraftDb[] = [];

async function openDb() {
  const db = await DraftDb.open({ name: TEST_DB, version: 3 });
  openHandles.push(db);
  return db;
}

async function closeAll() {
  while (openHandles.length) {
    try {
      openHandles.pop()?.close();
    } catch {
      // ignore
    }
  }
}

beforeEach(async () => {
  await closeAll();
  await deleteDraftDatabase(TEST_DB);
});

afterEach(async () => {
  await closeAll();
  await deleteDraftDatabase(TEST_DB);
});

describe("classifySyncError / merge / ui labels", () => {
  it("maps network, permission, file size, offline", () => {
    expect(classifySyncError(new Error("Failed to fetch")).code).toBe("network");
    expect(classifySyncError(new Error("JWT expired / unauthorized")).code).toBe("permission");
    expect(classifySyncError(new Error("Payload too large")).code).toBe("file_too_large");
    expect(classifySyncError(new Error("x"), false).code).toBe("offline");
  });

  it("never silently overwrites when remote is newer and local is dirty", () => {
    expect(
      decideMerge({
        localClientUpdatedAt: "2020-01-01T00:00:00.000Z",
        localSyncStatus: "pending",
        hasUnsyncedMedia: false,
        remote: {
          id: "r1",
          address: "A",
          clientUpdatedAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          shareToken: "t",
        },
      }),
    ).toBe("conflict");

    expect(
      decideMerge({
        localClientUpdatedAt: "2020-01-01T00:00:00.000Z",
        localSyncStatus: "synced",
        hasUnsyncedMedia: false,
        remote: {
          id: "r1",
          address: "A",
          clientUpdatedAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          shareToken: "t",
        },
      }),
    ).toBe("skip_remote_newer_clean");
  });

  it("exposes UI label keys for all statuses", () => {
    expect(syncStatusToUi("local_only").labelKey).toBe("savedLocal");
    expect(syncStatusToUi("pending").labelKey).toBe("pending");
    expect(syncStatusToUi("syncing").labelKey).toBe("syncing");
    expect(syncStatusToUi("synced").labelKey).toBe("synced");
    expect(syncStatusToUi("failed", "boom").canRetry).toBe(true);
    expect(syncStatusToUi("conflict").canRetry).toBe(true);
  });
});

describe("SyncEngine queue", () => {
  it("after login enqueues session + media and syncs end-to-end", async () => {
    const db = await openDb();
    const adapter = createMockViewingSyncAdapter({ userId: "user-1", online: true });
    const engine = createSyncEngine({ db, adapter });

    const session = await db.viewingSessions.create({
      address: "1200 Westwood",
      identified: true,
      syncStatus: "local_only",
      pros: ["採光"],
      risks: ["電箱"],
    });
    await db.viewingSessions.update(session.id, {
      propertyDraft: { clientUpdatedAt: new Date().toISOString(), shareToken: null },
    });
    const media = await db.media.create({
      sessionId: session.id,
      kind: "photo",
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
      tag: "panel",
    });

    const enqueued = await engine.enqueueSession(session.id, { userId: "user-1" });
    expect(enqueued.queueIds.length).toBeGreaterThanOrEqual(2);

    const result = await engine.processQueue();
    expect(result.skippedOffline).toBe(false);
    expect(result.failed).toBe(0);
    expect(result.conflicts).toBe(0);
    expect(result.succeeded).toBeGreaterThanOrEqual(2);

    const syncedSession = await db.viewingSessions.require(session.id);
    expect(syncedSession.remoteViewingId).toBeTruthy();
    expect(syncedSession.remoteRevision).toBe(1);
    expect(syncedSession.syncStatus).toBe("synced");

    const syncedMedia = await db.media.require(media.id);
    expect(syncedMedia.uploadStatus).toBe("uploaded");
    expect(syncedMedia.storagePath).toContain(media.id);
    expect(adapter.state.uploadCalls).toHaveLength(1);
  });

  it("references canonical media without duplicating blob bytes in DraftDb", async () => {
    const db = await openDb();
    const engine = createSyncEngine({
      db,
      adapter: createMockViewingSyncAdapter({ userId: null, online: false }),
    });
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

    const sessionId = await engine.importActiveDraft({
      sessionId: "local-session",
      userId: null,
      remoteViewingId: null,
      shareToken: null,
      address: "Canonical media",
      tags: [],
      market: "CA",
      identified: true,
      questions: [],
      notes: [],
      pros: [],
      risks: [],
      propertyDraft: {},
      clientUpdatedAt: new Date().toISOString(),
      media: [
        {
          id: "canonical-media",
          kind: "photo",
          label: "photo",
          mimeType: blob.type,
          size: blob.size,
          blob,
          remotePath: null,
          uploadStatus: "local",
        },
      ],
    });

    const [media] = await db.media.listBySession(sessionId);
    expect(media).toMatchObject({
      id: "canonical-media",
      blob: null,
      mediaRefId: "canonical-media",
      size: blob.size,
    });
  });

  it("does not re-upload the same mediaId (idempotent)", async () => {
    const db = await openDb();
    const adapter = createMockViewingSyncAdapter({ userId: "user-1" });
    const engine = createSyncEngine({ db, adapter });

    const session = await db.viewingSessions.create({
      address: "Idempotent",
      propertyDraft: { clientUpdatedAt: new Date().toISOString() },
    });
    // seed remote id so media can upload
    await db.viewingSessions.update(session.id, {
      remoteViewingId: "remote-fixed",
      propertyDraft: { clientUpdatedAt: new Date().toISOString() },
    });
    adapter.state.remotes.set("remote-fixed", {
      id: "remote-fixed",
      address: "Idempotent",
      clientUpdatedAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
      shareToken: "tok",
    });

    const media = await db.media.create({
      id: "media-stable-id",
      sessionId: session.id,
      kind: "video",
      blob: new Blob([new Uint8Array([9])], { type: "video/webm" }),
    });

    await engine.enqueueSession(session.id, { userId: "user-1" });
    await engine.processQueue();
    expect(adapter.state.uploadCalls.filter((c) => c.mediaId === media.id)).toHaveLength(1);

    // Re-enqueue after mark local again would still skip binary if uploaded+path set
    await engine.enqueueSession(session.id, { userId: "user-1" });
    await engine.processQueue();
    expect(adapter.state.uploadCalls.filter((c) => c.mediaId === media.id)).toHaveLength(1);

    // Queue has only one upload row for this mediaId
    const jobs = await db.syncQueue.listBySession(session.id);
    expect(jobs.filter((j) => j.entityId === media.id && j.operation === "upload")).toHaveLength(1);
  });

  it("stays local when offline and resumes after network returns", async () => {
    const db = await openDb();
    const adapter = createMockViewingSyncAdapter({ userId: "user-1", online: false });
    const engine = createSyncEngine({ db, adapter });

    const session = await db.viewingSessions.create({
      address: "Offline house",
      propertyDraft: { clientUpdatedAt: new Date().toISOString() },
    });
    await db.media.create({
      sessionId: session.id,
      kind: "photo",
      blob: new Blob([new Uint8Array([4])], { type: "image/jpeg" }),
    });

    await engine.enqueueSession(session.id, { userId: "user-1" });
    const offlineResult = await engine.processQueue();
    expect(offlineResult.skippedOffline).toBe(true);
    expect(adapter.state.saveCalls).toHaveLength(0);

    adapter.state.online = true;
    const onlineResult = await engine.processQueue();
    expect(onlineResult.skippedOffline).toBe(false);
    expect(onlineResult.succeeded).toBeGreaterThan(0);
    expect((await db.viewingSessions.require(session.id)).syncStatus).toBe("synced");
  });

  it("retries failed media upload and continues after reopen", async () => {
    const db = await openDb();
    const adapter = createMockViewingSyncAdapter({
      userId: "user-1",
      failUploadForMediaIds: new Set(["media-big"]),
    });
    const engine = createSyncEngine({ db, adapter });

    const session = await db.viewingSessions.create({
      address: "Retry house",
      remoteViewingId: "remote-r",
      propertyDraft: { clientUpdatedAt: new Date().toISOString() },
    });
    adapter.state.remotes.set("remote-r", {
      id: "remote-r",
      address: "Retry house",
      clientUpdatedAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
      shareToken: "t",
    });
    await db.media.create({
      id: "media-big",
      sessionId: session.id,
      kind: "photo",
      blob: new Blob([new Uint8Array([1])], { type: "image/jpeg" }),
    });

    await engine.enqueueSession(session.id, { userId: "user-1" });
    await engine.processQueue();
    expect((await db.media.require("media-big")).uploadStatus).toBe("failed");

    // Simulate page reopen: new engine, same DB, clear fail flag, retry
    db.close();
    openHandles.splice(openHandles.indexOf(db), 1);

    const db2 = await openDb();
    adapter.state.failUploadForMediaIds = new Set();
    const engine2 = createSyncEngine({ db: db2, adapter });
    const retry = await engine2.retryFailed(session.id);
    expect(retry.failed).toBe(0);
    expect((await db2.media.require("media-big")).uploadStatus).toBe("uploaded");
  });

  it("marks conflict when remote is newer and local has pending changes", async () => {
    const db = await openDb();
    const adapter = createMockViewingSyncAdapter({ userId: "user-1" });
    const engine = createSyncEngine({ db, adapter });

    const session = await db.viewingSessions.create({
      address: "Local dirty",
      remoteViewingId: "remote-c",
      syncStatus: "pending",
      propertyDraft: { clientUpdatedAt: "2020-01-01T00:00:00.000Z" },
    });
    adapter.state.remotes.set("remote-c", {
      id: "remote-c",
      address: "Cloud newer",
      clientUpdatedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      shareToken: "cloud",
    });

    await engine.enqueueSession(session.id, { userId: "user-1" });
    const result = await engine.processQueue();
    expect(result.conflicts).toBe(1);
    expect((await db.viewingSessions.require(session.id)).syncStatus).toBe("conflict");
    // Must not have overwritten remote address via save
    expect(adapter.state.remotes.get("remote-c")?.address).toBe("Cloud newer");
  });

  it("surfaces file_too_large as failed with message", async () => {
    const db = await openDb();
    const adapter = createMockViewingSyncAdapter({
      userId: "user-1",
      failNextUpload: new Error("Payload too large"),
    });
    const engine = createSyncEngine({ db, adapter });
    const session = await db.viewingSessions.create({
      address: "Big file",
      remoteViewingId: "remote-f",
      propertyDraft: { clientUpdatedAt: new Date().toISOString() },
    });
    adapter.state.remotes.set("remote-f", {
      id: "remote-f",
      address: "Big file",
      clientUpdatedAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
      shareToken: "t",
    });
    await db.media.create({
      sessionId: session.id,
      kind: "video",
      blob: new Blob([new Uint8Array([1, 2])], { type: "video/webm" }),
    });
    await engine.enqueueSession(session.id, { userId: "user-1" });
    await engine.processQueue();
    const ui = await engine.getSessionUiStatus(session.id);
    expect(ui?.status).toBe("failed");
    expect(ui?.errorMessage).toMatch(/檔案過大/);
    expect(ui?.canRetry).toBe(true);
  });

  it("reuses the owner-scoped create key after a network retry", async () => {
    const db = await openDb();
    const adapter = createMockViewingSyncAdapter({
      userId: "user-1",
      failNextSave: new Error("Failed to fetch"),
    });
    const engine = createSyncEngine({ db, adapter });
    const session = await db.viewingSessions.create({
      address: "Stable create",
      propertyDraft: { clientUpdatedAt: new Date().toISOString() },
    });
    await engine.enqueueSession(session.id, { userId: "user-1" });
    await engine.processQueue();
    const [job] = await db.syncQueue.listBySession(session.id);
    await db.syncQueue.update(job!.id, { nextRetryAt: null });
    await engine.processQueue();
    expect(adapter.state.saveCalls).toHaveLength(2);
    expect(adapter.state.saveCalls.map((call) => call.idempotencyKey)).toEqual([
      session.id,
      session.id,
    ]);
  });

  it("treats a revision CAS miss as conflict", async () => {
    const db = await openDb();
    const adapter = createMockViewingSyncAdapter({ userId: "user-1" });
    const session = await db.viewingSessions.create({
      address: "CAS local",
      remoteViewingId: "remote-cas",
      remoteRevision: 1,
      syncStatus: "pending",
      propertyDraft: { clientUpdatedAt: "2026-01-02T00:00:00.000Z" },
    });
    adapter.state.remotes.set("remote-cas", {
      id: "remote-cas",
      address: "CAS remote",
      clientUpdatedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      shareToken: "cas",
      revision: 2,
    });
    const engine = createSyncEngine({ db, adapter });
    await engine.enqueueSession(session.id, { userId: "user-1" });
    const result = await engine.processQueue();
    expect(result.conflicts).toBe(1);
    expect((await db.viewingSessions.require(session.id)).syncStatus).toBe("conflict");
  });

  it("counts network failures toward max attempts and stops auto-drain", async () => {
    const db = await openDb();
    const adapter = createMockViewingSyncAdapter({ userId: "user-1" });
    const engine = createSyncEngine({ db, adapter });
    const session = await db.viewingSessions.create({
      address: "Network terminal",
      propertyDraft: { clientUpdatedAt: new Date().toISOString() },
    });
    await engine.enqueueSession(session.id, { userId: "user-1" });
    const [job] = await db.syncQueue.listBySession(session.id);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      adapter.state.failNextSave = new Error("Failed to fetch");
      await db.syncQueue.update(job!.id, { nextRetryAt: null });
      await engine.processQueue();
    }
    const terminal = await db.syncQueue.require(job!.id);
    expect(terminal).toMatchObject({ syncStatus: "failed", attempts: 8 });
    const calls = adapter.state.saveCalls.length;
    await engine.processQueue();
    expect(adapter.state.saveCalls).toHaveLength(calls);
  });
});
