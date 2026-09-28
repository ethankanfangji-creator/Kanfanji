import { deleteLocalThread, listLocalThreads } from "./local-store";
import { removeMediaByThread } from "./media-library";
import { isExpiredGuestThread } from "./guest-retention";

export async function sweepExpiredGuestThreads(now = new Date()): Promise<number> {
  const expired = listLocalThreads().filter((thread) => isExpiredGuestThread(thread, now));
  for (const thread of expired) {
    await removeMediaByThread(thread.id);
    deleteLocalThread(thread.id);
  }
  return expired.length;
}
