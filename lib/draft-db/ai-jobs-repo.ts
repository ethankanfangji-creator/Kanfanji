import { DraftDbError } from "./errors";
import { nowIso } from "./ids";
import { STORE } from "./migrations";
import { inAccountScope, isVisibleInScope, withStoreError, type RepoContext } from "./repository-utils";
import type { AiJob, CreateAiJobInput, SyncStatus } from "./types";

const MAX_ATTEMPTS = 4;

export function aiJobId(accountScope: string, kind: AiJob["kind"], mediaId: string): string {
  return `${accountScope}:ai:${kind}:${mediaId}`;
}

export function createAiJobsRepository(ctx: RepoContext) {
  return {
    async enqueue(input: CreateAiJobInput): Promise<AiJob> {
      return withStoreError("aiJobs.enqueue", async () => {
        if (!input.sessionId || !input.mediaId || !input.consentVersion) {
          throw new DraftDbError("invalid AI job", "invalid_input");
        }
        const accountScope = input.accountScope ?? ctx.accountScope ?? "guest:legacy";
        const id = aiJobId(accountScope, input.kind, input.mediaId);
        const existing = await ctx.db.get(STORE.aiJobs, id);
        if (existing && !existing.deletedAt) return existing;
        const timestamp = nowIso();
        const job: AiJob = {
          id,
          accountScope,
          sessionId: input.sessionId,
          mediaId: input.mediaId,
          kind: input.kind,
          consentVersion: input.consentVersion,
          payload: input.payload ?? {},
          result: null,
          appliedAt: null,
          attempts: 0,
          lastError: null,
          nextRetryAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          userId: input.userId ?? null,
          syncStatus: "pending",
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
          version: 1,
        };
        await ctx.db.put(STORE.aiJobs, job);
        return job;
      });
    },

    async list(): Promise<AiJob[]> {
      return withStoreError("aiJobs.list", async () =>
        inAccountScope(await ctx.db.getAll(STORE.aiJobs), ctx.accountScope).filter(
          (job) => !job.deletedAt,
        ),
      );
    },

    async get(id: string): Promise<AiJob | null> {
      return withStoreError("aiJobs.get", async () => {
        const job = await ctx.db.get(STORE.aiJobs, id);
        return isVisibleInScope(job, ctx.accountScope) ? job ?? null : null;
      });
    },

    async update(id: string, patch: Partial<Omit<AiJob, "id" | "createdAt">>): Promise<AiJob> {
      return withStoreError("aiJobs.update", async () => {
        const existing = await ctx.db.get(STORE.aiJobs, id);
        if (!existing || !isVisibleInScope(existing, ctx.accountScope)) {
          throw new DraftDbError("AI job not found", "not_found");
        }
        const next = {
          ...existing,
          ...patch,
          id,
          createdAt: existing.createdAt,
          updatedAt: nowIso(),
          version: existing.version + 1,
        };
        await ctx.db.put(STORE.aiJobs, next);
        return next;
      });
    },

    async claimNext(
      workerId: string,
      now = new Date(),
      leaseMs = 60_000,
    ): Promise<AiJob | null> {
      return withStoreError("aiJobs.claimNext", async () => {
        const tx = ctx.db.transaction(STORE.aiJobs, "readwrite");
        const store = tx.objectStore(STORE.aiJobs);
        const nowMs = now.getTime();
        const candidate = (await store.getAll())
          .filter((job) => {
            if (job.deletedAt || !isVisibleInScope(job, ctx.accountScope)) return false;
            if (job.nextRetryAt && Date.parse(job.nextRetryAt) > nowMs) return false;
            return (
              job.syncStatus === "pending" ||
              (job.syncStatus === "syncing" &&
                Boolean(job.leaseExpiresAt) &&
                Date.parse(job.leaseExpiresAt!) <= nowMs)
            );
          })
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        if (!candidate) {
          await tx.done;
          return null;
        }
        const claimed: AiJob = {
          ...candidate,
          syncStatus: "syncing",
          leaseOwner: workerId,
          leaseExpiresAt: new Date(nowMs + leaseMs).toISOString(),
          updatedAt: now.toISOString(),
          version: candidate.version + 1,
        };
        await store.put(claimed);
        await tx.done;
        return claimed;
      });
    },

    async complete(
      claim: Pick<AiJob, "id" | "leaseOwner" | "version">,
      result: Record<string, unknown>,
    ): Promise<AiJob> {
      return transitionClaimed(ctx, claim, (existing) => ({
        ...existing,
        result,
        syncStatus: "synced",
        lastError: null,
        nextRetryAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      }));
    },

    async markApplied(id: string): Promise<AiJob> {
      const existing = await this.get(id);
      if (!existing) throw new DraftDbError("AI job not found", "not_found");
      if (existing.appliedAt) return existing;
      return this.update(id, { appliedAt: nowIso() });
    },

    async fail(
      claim: Pick<AiJob, "id" | "leaseOwner" | "version">,
      message: string,
      now = new Date(),
    ): Promise<AiJob> {
      return transitionClaimed(ctx, claim, (existing) => {
        const attempts = existing.attempts + 1;
        const terminal = attempts >= MAX_ATTEMPTS;
        const syncStatus: SyncStatus = terminal ? "failed" : "pending";
        return {
          ...existing,
          attempts,
          syncStatus,
          lastError: message.slice(0, 160),
          nextRetryAt: terminal
            ? null
            : new Date(now.getTime() + Math.min(60_000, 1_000 * 2 ** attempts)).toISOString(),
          leaseOwner: null,
          leaseExpiresAt: null,
        };
      });
    },
  };
}

export type AiJobsRepository = ReturnType<typeof createAiJobsRepository>;

async function transitionClaimed(
  ctx: RepoContext,
  claim: Pick<AiJob, "id" | "leaseOwner" | "version">,
  mutate: (existing: AiJob) => AiJob,
): Promise<AiJob> {
  return withStoreError("aiJobs.transitionClaimed", async () => {
    if (!claim.leaseOwner) {
      throw new DraftDbError("AI claim has no lease owner", "invalid_input");
    }
    const tx = ctx.db.transaction(STORE.aiJobs, "readwrite");
    const store = tx.objectStore(STORE.aiJobs);
    const existing = await store.get(claim.id);
    if (
      !existing ||
      !isVisibleInScope(existing, ctx.accountScope) ||
      existing.syncStatus !== "syncing" ||
      existing.leaseOwner !== claim.leaseOwner ||
      existing.version !== claim.version
    ) {
      await tx.done;
      throw new DraftDbError("AI lease was reclaimed", "lease_lost");
    }
    const next = {
      ...mutate(existing),
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
      version: existing.version + 1,
    };
    await store.put(next);
    await tx.done;
    return next;
  });
}
