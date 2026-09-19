import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyCommittedAiJob,
  completeAiJobIfLeaseHeld,
  failAiJobIfLeaseHeld,
} from "@/lib/ai-boundary/job-commit";
import { DRAFT_DB_VERSION, DraftDb, deleteDraftDatabase } from "./index";

const TEST_DB = "kanfangji-ai-jobs-test";
let db: DraftDb;

beforeEach(async () => {
  await deleteDraftDatabase(TEST_DB);
  db = await DraftDb.open({
    name: TEST_DB,
    version: DRAFT_DB_VERSION,
    accountScope: "guest:device-a",
  });
});

afterEach(async () => {
  db.close();
  await deleteDraftDatabase(TEST_DB);
});

describe("durable AI jobs", () => {
  it("enqueues idempotently by account/kind/media and leases atomically", async () => {
    const input = {
      sessionId: "session-1",
      mediaId: "media-1",
      kind: "photo" as const,
      consentVersion: "2026-09-15",
      payload: { tag: "window" },
    };
    const first = await db.aiJobs.enqueue(input);
    const duplicate = await db.aiJobs.enqueue(input);
    expect(duplicate.id).toBe(first.id);
    expect(await db.aiJobs.list()).toHaveLength(1);

    const [claimA, claimB] = await Promise.all([
      db.aiJobs.claimNext("worker-a", new Date("2026-01-01T00:00:00Z"), 1_000),
      db.aiJobs.claimNext("worker-b", new Date("2026-01-01T00:00:00Z"), 1_000),
    ]);
    expect([claimA, claimB].filter(Boolean)).toHaveLength(1);

    const recovered = await db.aiJobs.claimNext(
      "worker-b",
      new Date("2026-01-01T00:00:02Z"),
      1_000,
    );
    expect(recovered?.leaseOwner).toBe("worker-b");
    const stale = claimA ?? claimB;
    await expect(
      db.aiJobs.complete(stale!, { text: "stale" }),
    ).rejects.toMatchObject({ code: "lease_lost" });
    await expect(
      db.aiJobs.complete(recovered!, { text: "current" }),
    ).resolves.toMatchObject({ syncStatus: "synced" });
  });

  it("retries with backoff, becomes terminal, and applies results once", async () => {
    const job = await db.aiJobs.enqueue({
      sessionId: "session-1",
      mediaId: "audio-1",
      kind: "audio",
      consentVersion: "2026-09-15",
    });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const now = new Date(Date.UTC(2026, 0, 1, 0, attempt * 2));
      const claim = await db.aiJobs.claimNext("worker", now);
      expect(claim).toBeTruthy();
      await db.aiJobs.fail(claim!, "provider detail", now);
    }
    expect(await db.aiJobs.claimNext("worker")).toBeNull();
    expect(await db.aiJobs.get(job.id)).toMatchObject({ syncStatus: "failed", attempts: 4 });

    const photo = await db.aiJobs.enqueue({
      sessionId: "session-1",
      mediaId: "photo-2",
      kind: "photo",
      consentVersion: "2026-09-15",
    });
    const photoClaim = await db.aiJobs.claimNext("worker");
    expect(photoClaim?.id).toBe(photo.id);
    const completed = await db.aiJobs.complete(photoClaim!, {
      text: "Ask about the seal",
      mediaId: "photo-2",
    });
    const applied = await db.aiJobs.markApplied(completed.id);
    const appliedAgain = await db.aiJobs.markApplied(photo.id);
    expect(appliedAgain.appliedAt).toBe(applied.appliedAt);
  });

  it.each(["audio", "photo"] as const)(
    "never applies stale %s worker output after lease recovery",
    async (kind) => {
      const job = await db.aiJobs.enqueue({
        sessionId: "session-1",
        mediaId: `${kind}-race`,
        kind,
        consentVersion: "2026-09-15",
      });
      const stale = await db.aiJobs.claimNext(
        "worker-stale",
        new Date("2026-01-01T00:00:00Z"),
        1_000,
      );
      const current = await db.aiJobs.claimNext(
        "worker-current",
        new Date("2026-01-01T00:00:02Z"),
        1_000,
      );
      expect(stale?.id).toBe(job.id);
      expect(current?.id).toBe(job.id);

      const staleApplied: string[] = [];
      const staleCommit = await completeAiJobIfLeaseHeld(db.aiJobs, stale!, {
        text: "stale",
      });
      if (staleCommit) {
        await applyCommittedAiJob(db.aiJobs, staleCommit, (result) => {
          staleApplied.push(String(result.text));
        });
      }
      expect(staleCommit).toBeNull();
      expect(staleApplied).toEqual([]);
      await expect(failAiJobIfLeaseHeld(db.aiJobs, stale!, "late failure")).resolves.toBeNull();

      const applied: string[] = [];
      const committed = await completeAiJobIfLeaseHeld(db.aiJobs, current!, {
        text: "current",
      });
      expect(committed).not.toBeNull();
      await applyCommittedAiJob(db.aiJobs, committed!, (result) => {
        applied.push(String(result.text));
      });
      expect(applied).toEqual(["current"]);
      expect(await db.aiJobs.get(job.id)).toMatchObject({
        syncStatus: "synced",
        result: { text: "current" },
      });
    },
  );
});
