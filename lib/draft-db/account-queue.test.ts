import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DRAFT_DB_VERSION, DraftDb, deleteDraftDatabase } from "./index";

const TEST_DB = "kanfangji-account-queue-test";
const handles: DraftDb[] = [];

async function open(accountScope?: string) {
  const db = await DraftDb.open({ name: TEST_DB, version: DRAFT_DB_VERSION, accountScope });
  handles.push(db);
  return db;
}

async function closeAll() {
  while (handles.length) handles.pop()?.close();
}

beforeEach(async () => {
  await closeAll();
  await deleteDraftDatabase(TEST_DB);
});

afterEach(async () => {
  await closeAll();
  await deleteDraftDatabase(TEST_DB);
});

describe("DraftDb account isolation", () => {
  it("isolates scopes and explicitly claims this installation's guest rows", async () => {
    const guest = await open("guest:installation-a");
    const session = await guest.viewingSessions.create({ address: "Guest home" });
    await guest.notes.create({ sessionId: session.id, body: "private note" });
    await guest.syncQueue.create({
      sessionId: session.id,
      entityType: "viewingSession",
      entityId: session.id,
      operation: "create",
    });

    const other = await open("user:other");
    expect(await other.viewingSessions.list()).toEqual([]);
    expect(await other.syncQueue.list()).toEqual([]);
    await expect(other.viewingSessions.delete(session.id)).rejects.toMatchObject({
      code: "not_found",
    });

    const defaultScoped = await open();
    expect(await defaultScoped.viewingSessions.list()).toEqual([]);

    const admin = await open();
    expect(
      await admin.claimGuestScope("guest:installation-a", "user:user-1", "user-1"),
    ).toBe(3);

    expect(await guest.viewingSessions.list()).toEqual([]);
    const user = await open("user:user-1");
    expect((await user.viewingSessions.list()).map((row) => row.address)).toEqual(["Guest home"]);
    expect((await user.notes.list())[0]?.accountScope).toBe("user:user-1");
    expect((await user.syncQueue.list())[0]?.userId).toBe("user-1");
  });
});

describe("atomic queue leases", () => {
  it("allows only one worker to claim and recovers an expired lease", async () => {
    const first = await open("user:user-1");
    const second = await open("user:user-1");
    const session = await first.viewingSessions.create({ address: "Lease" });
    await first.syncQueue.create({
      sessionId: session.id,
      entityType: "viewingSession",
      entityId: session.id,
      operation: "create",
    });

    const claims = await Promise.all([
      first.syncQueue.claimNextRunnable("worker-a", new Date("2026-01-01T00:00:00Z"), 1_000),
      second.syncQueue.claimNextRunnable("worker-b", new Date("2026-01-01T00:00:00Z"), 1_000),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);

    const recovered = await second.syncQueue.claimNextRunnable(
      "worker-b",
      new Date("2026-01-01T00:00:02Z"),
      1_000,
    );
    expect(recovered?.leaseOwner).toBe("worker-b");
    const stale = claims.find(Boolean);
    await expect(
      first.syncQueue.transitionClaimed(stale!, {
        syncStatus: "synced",
        leaseOwner: null,
        leaseExpiresAt: null,
      }),
    ).rejects.toMatchObject({ code: "lease_lost" });
    await expect(
      second.syncQueue.transitionClaimed(recovered!, {
        syncStatus: "synced",
        leaseOwner: null,
        leaseExpiresAt: null,
      }),
    ).resolves.toMatchObject({ syncStatus: "synced" });
  });

  it("does not auto-drain terminal failures and permits explicit retry", async () => {
    const db = await open("user:user-1");
    const session = await db.viewingSessions.create({ address: "Terminal" });
    const job = await db.syncQueue.create({
      sessionId: session.id,
      entityType: "viewingSession",
      entityId: session.id,
      operation: "create",
      syncStatus: "failed",
      attempts: 8,
    });
    expect(await db.syncQueue.claimNextRunnable("worker")).toBeNull();
    await db.syncQueue.update(job.id, {
      syncStatus: "pending",
      attempts: 0,
      lastError: null,
      nextRetryAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    expect((await db.syncQueue.claimNextRunnable("worker"))?.id).toBe(job.id);
  });
});
