export type ClaimThread = {
  id: string;
  updatedAt: string;
  ownerUserId: string | null;
};

export type ClaimPoster = (
  thread: ClaimThread,
) => Promise<"created" | "exists" | "limit_reached" | "network">;

export async function claimLocalThreads(input: {
  threads: ClaimThread[];
  userId: string;
  post: ClaimPoster;
}): Promise<{ uploaded: number; blocked: number; pending: number }> {
  const pending = input.threads
    .filter((thread) => thread.ownerUserId == null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  let uploaded = 0;
  let blocked = 0;
  let remaining = 0;
  let blockedMode = false;
  for (const thread of pending) {
    if (blockedMode) {
      thread.ownerUserId = input.userId;
      blocked += 1;
      continue;
    }
    const outcome = await input.post(thread);
    if (outcome === "network") {
      remaining = pending.length - uploaded - blocked;
      break;
    }
    if (outcome === "limit_reached") {
      blockedMode = true;
      thread.ownerUserId = input.userId;
      blocked += 1;
      continue;
    }
    thread.ownerUserId = input.userId;
    uploaded += 1;
  }
  return { uploaded, blocked, pending: remaining };
}
