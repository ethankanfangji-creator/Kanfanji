import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DraftDb,
  DRAFT_DB_VERSION,
  deleteDraftDatabase,
  openDraftDatabase,
} from "./index";

const TEST_DB = "kanfangji-drafts-test";

const openHandles: DraftDb[] = [];

async function openTestDb(version = DRAFT_DB_VERSION): Promise<DraftDb> {
  const db = await DraftDb.open({ name: TEST_DB, version });
  openHandles.push(db);
  return db;
}

async function closeAllHandles() {
  while (openHandles.length) {
    const db = openHandles.pop();
    try {
      db?.close();
    } catch {
      // ignore
    }
  }
}

beforeEach(async () => {
  await closeAllHandles();
  await deleteDraftDatabase(TEST_DB);
});

afterEach(async () => {
  await closeAllHandles();
  await deleteDraftDatabase(TEST_DB);
});

describe("DraftDb viewingSessions", () => {
  it("creates, reads, updates, and deletes a session", async () => {
    const db = await openTestDb();
    const created = await db.viewingSessions.create({
      address: "1200 Westwood St, Coquitlam",
      tags: ["Coquitlam"],
      market: "CA",
      identified: true,
      pros: ["採光好"],
      risks: ["電箱待換"],
    });

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(created.syncStatus).toBe("local_only");
    expect(created.userId).toBeNull();
    expect(created.version).toBe(1);
    expect(created.deletedAt).toBeNull();

    const loaded = await db.viewingSessions.get(created.id);
    expect(loaded?.address).toBe("1200 Westwood St, Coquitlam");

    const updated = await db.viewingSessions.update(created.id, {
      address: "Updated Address",
      syncStatus: "pending",
      userId: "user-1",
    });
    expect(updated.address).toBe("Updated Address");
    expect(updated.version).toBe(2);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.id).toBe(created.id);

    await db.viewingSessions.delete(created.id);
    expect(await db.viewingSessions.get(created.id)).toBeNull();
  });

  it("rejects changing immutable id on update", async () => {
    const db = await openTestDb();
    const created = await db.viewingSessions.create({ address: "A" });
    await expect(
      db.viewingSessions.update(created.id, { id: "other-id" } as never),
    ).rejects.toMatchObject({ code: "immutable_id" });
  });

  it("lists active sessions and hides soft-deleted by default", async () => {
    const db = await openTestDb();
    const a = await db.viewingSessions.create({ address: "A" });
    const b = await db.viewingSessions.create({ address: "B" });
    await db.viewingSessions.softDelete(a.id);

    const active = await db.viewingSessions.list();
    expect(active.map((row) => row.id)).toEqual([b.id]);

    const all = await db.viewingSessions.list({ includeDeleted: true });
    expect(all).toHaveLength(2);
  });
});

describe("DraftDb notes / media / syncQueue", () => {
  it("CRUD notes linked to a session", async () => {
    const db = await openTestDb();
    const session = await db.viewingSessions.create({ address: "Home" });
    const note = await db.notes.create({
      sessionId: session.id,
      kind: "transcript",
      body: "屋頂2018年換過",
      durationSec: 42,
      matchedQuestionIds: [1, 3],
    });

    expect(note.version).toBe(1);
    const listed = await db.notes.listBySession(session.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.body).toBe("屋頂2018年換過");

    const updated = await db.notes.update(note.id, { body: "更新後筆記" });
    expect(updated.version).toBe(2);
    expect(updated.sessionId).toBe(session.id);

    await db.notes.delete(note.id);
    expect(await db.notes.get(note.id)).toBeNull();
  });

  it("stores media as Blob (not base64 string)", async () => {
    const db = await openTestDb();
    const session = await db.viewingSessions.create({ address: "Home" });
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" });

    const media = await db.media.create({
      sessionId: session.id,
      kind: "photo",
      blob,
      tag: "電箱",
    });

    expect(media.blob).toBeInstanceOf(Blob);
    expect(media.size).toBe(4);
    expect(media.mimeType).toBe("image/jpeg");
    expect(media.uploadStatus).toBe("local");

    const reloaded = await db.media.require(media.id);
    expect(reloaded.blob).toBeInstanceOf(Blob);
    expect(await reloaded.blob!.arrayBuffer()).toEqual(await blob.arrayBuffer());

    const video = await db.media.create({
      sessionId: session.id,
      kind: "video",
      blob: new Blob([new Uint8Array([9, 9])], { type: "video/webm" }),
      label: "客廳",
      durationSec: 12,
    });
    expect(video.kind).toBe("video");

    await expect(
      db.media.create({
        sessionId: session.id,
        kind: "photo",
        blob: "not-a-blob" as unknown as Blob,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("CRUD syncQueue items for future login sync", async () => {
    const db = await openTestDb();
    const session = await db.viewingSessions.create({ address: "Home" });
    const item = await db.syncQueue.create({
      sessionId: session.id,
      entityType: "media",
      entityId: "media-1",
      operation: "upload",
      payload: { pathHint: "photos/1.jpg" },
      userId: null,
    });

    expect(item.syncStatus).toBe("pending");
    expect(item.attempts).toBe(0);

    const bumped = await db.syncQueue.update(item.id, {
      attempts: 1,
      lastError: "network",
      syncStatus: "failed",
      nextRetryAt: new Date().toISOString(),
    });
    expect(bumped.version).toBe(2);
    expect(bumped.attempts).toBe(1);

    await db.syncQueue.delete(item.id);
    expect(await db.syncQueue.get(item.id)).toBeNull();
  });

  it("enqueueIdempotent does not duplicate the same mediaId upload job", async () => {
    const db = await openTestDb();
    const session = await db.viewingSessions.create({ address: "Home" });
    const first = await db.syncQueue.enqueueIdempotent({
      sessionId: session.id,
      entityType: "media",
      entityId: "media-stable",
      operation: "upload",
    });
    const second = await db.syncQueue.enqueueIdempotent({
      sessionId: session.id,
      entityType: "media",
      entityId: "media-stable",
      operation: "upload",
    });
    expect(second.id).toBe(first.id);
    expect(await db.syncQueue.listBySession(session.id)).toHaveLength(1);
  });
});

describe("DraftDb.clearSession", () => {
  it("hard-deletes session and related rows", async () => {
    const db = await openTestDb();
    const session = await db.viewingSessions.create({ address: "Clear me" });
    await db.notes.create({ sessionId: session.id, body: "note" });
    await db.media.create({
      sessionId: session.id,
      kind: "audio",
      blob: new Blob([new Uint8Array([7])], { type: "audio/webm" }),
    });
    await db.syncQueue.create({
      sessionId: session.id,
      entityType: "viewingSession",
      entityId: session.id,
      operation: "create",
    });

    const result = await db.clearSession(session.id, "hard");
    expect(result).toMatchObject({
      sessionId: session.id,
      notes: 1,
      media: 1,
      syncQueue: 1,
      mode: "hard",
    });

    expect(await db.viewingSessions.get(session.id)).toBeNull();
    expect(await db.notes.listBySession(session.id, { includeDeleted: true })).toHaveLength(0);
    expect(await db.media.listBySession(session.id, { includeDeleted: true })).toHaveLength(0);
    expect(await db.syncQueue.listBySession(session.id, { includeDeleted: true })).toHaveLength(0);
  });

  it("soft-deletes session tree with tombstones", async () => {
    const db = await openTestDb();
    const session = await db.viewingSessions.create({ address: "Soft" });
    const note = await db.notes.create({ sessionId: session.id, body: "n" });

    await db.clearSession(session.id, "soft");

    expect((await db.viewingSessions.get(session.id))?.deletedAt).toBeTruthy();
    expect((await db.notes.get(note.id))?.deletedAt).toBeTruthy();
    expect(await db.notes.listBySession(session.id)).toHaveLength(0);
    expect(await db.notes.listBySession(session.id, { includeDeleted: true })).toHaveLength(1);
  });
});

describe("DraftDb reopen and migration", () => {
  it("persists data across database reopen", async () => {
    const db1 = await openTestDb();
    const session = await db1.viewingSessions.create({
      address: "Persist me",
      questions: [{ id: 1, text: "漏水嗎？", checked: false }],
    });
    const blob = new Blob([new Uint8Array([10, 20, 30])], { type: "image/png" });
    const media = await db1.media.create({
      sessionId: session.id,
      kind: "photo",
      blob,
      tag: "浴室",
    });
    db1.close();
    openHandles.splice(openHandles.indexOf(db1), 1);

    const db2 = await openTestDb();
    const restoredSession = await db2.viewingSessions.require(session.id);
    expect(restoredSession.address).toBe("Persist me");
    expect(restoredSession.questions[0]?.text).toBe("漏水嗎？");

    const restoredMedia = await db2.media.require(media.id);
    expect(restoredMedia.blob).toBeInstanceOf(Blob);
    expect(restoredMedia.size).toBe(3);
    expect(await restoredMedia.blob!.arrayBuffer()).toEqual(await blob.arrayBuffer());
  });

  it("migrates v1 → v2 without clearing user data", async () => {
    const v1 = await openTestDb(1);
    const session = await v1.viewingSessions.create({
      address: "Pre-migration address",
      remoteViewingId: "remote-abc",
    });
    await v1.notes.create({
      sessionId: session.id,
      body: "keep this note",
    });
    await v1.media.create({
      sessionId: session.id,
      kind: "photo",
      blob: new Blob([new Uint8Array([5, 5])], { type: "image/jpeg" }),
    });
    v1.close();
    openHandles.splice(openHandles.indexOf(v1), 1);

    const v2 = await openTestDb(2);
    const restored = await v2.viewingSessions.require(session.id);
    expect(restored.address).toBe("Pre-migration address");
    expect(restored.remoteViewingId).toBe("remote-abc");
    expect(await v2.notes.listBySession(session.id)).toHaveLength(1);
    expect(await v2.media.listBySession(session.id)).toHaveLength(1);

    v2.close();
    openHandles.splice(openHandles.indexOf(v2), 1);

    const raw = await openDraftDatabase({ name: TEST_DB, version: 2 });
    try {
      const tx = raw.transaction("viewingSessions", "readonly");
      expect(tx.objectStore("viewingSessions").indexNames.contains("byRemoteViewingId")).toBe(
        true,
      );
      const byRemote = await tx
        .objectStore("viewingSessions")
        .index("byRemoteViewingId")
        .get("remote-abc");
      expect(byRemote?.id).toBe(session.id);
    } finally {
      raw.close();
    }
  });

  it("migrates v2 → v3 with account-scope indexes and preserves rows", async () => {
    const v2 = await openTestDb(2);
    const session = await v2.viewingSessions.create({ address: "Keep through v3" });
    v2.close();
    openHandles.splice(openHandles.indexOf(v2), 1);

    const v3 = await openTestDb(3);
    expect((await v3.viewingSessions.require(session.id)).address).toBe("Keep through v3");
    for (const storeName of ["viewingSessions", "notes", "media", "syncQueue"] as const) {
      expect(v3.db.transaction(storeName).store.indexNames.contains("byAccountScope")).toBe(true);
    }
  });

  it("surfaces not_found errors from require()", async () => {
    const db = await openTestDb();
    await expect(db.viewingSessions.require("missing")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
