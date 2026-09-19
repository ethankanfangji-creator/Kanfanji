import type { AiJobsRepository } from "@/lib/draft-db/ai-jobs-repo";
import type { AiJob } from "@/lib/draft-db";

type ClaimedJob = Pick<AiJob, "id" | "leaseOwner" | "version">;

export function isAiLeaseLost(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "lease_lost",
  );
}

/** Returns null when another worker reclaimed the lease; callers must not apply that output. */
export async function completeAiJobIfLeaseHeld(
  repository: Pick<AiJobsRepository, "complete">,
  claim: ClaimedJob,
  result: Record<string, unknown>,
): Promise<AiJob | null> {
  try {
    return await repository.complete(claim, result);
  } catch (error) {
    if (isAiLeaseLost(error)) return null;
    throw error;
  }
}

/** Lease loss is an expected competing-worker outcome, not an unhandled failure. */
export async function failAiJobIfLeaseHeld(
  repository: Pick<AiJobsRepository, "fail">,
  claim: ClaimedJob,
  message: string,
): Promise<AiJob | null> {
  try {
    return await repository.fail(claim, message);
  } catch (error) {
    if (isAiLeaseLost(error)) return null;
    throw error;
  }
}

/**
 * Applies only a result already committed by lease CAS. Application must be idempotent by job id.
 */
export async function applyCommittedAiJob(
  repository: Pick<AiJobsRepository, "markApplied">,
  committed: AiJob,
  apply: (result: Record<string, unknown>, job: AiJob) => Promise<void> | void,
): Promise<void> {
  if (committed.syncStatus !== "synced" || !committed.result || committed.appliedAt) return;
  await apply(committed.result, committed);
  await repository.markApplied(committed.id);
}
