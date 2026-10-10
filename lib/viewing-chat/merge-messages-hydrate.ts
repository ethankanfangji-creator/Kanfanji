import { appendChatMessages } from "@/lib/viewing-chat/append-messages";
import { localRevisionIsBehind } from "@/lib/viewing-chat/merge-messages";

/**
 * Merge cloud + local messages without resurrecting locally-deleted notes.
 * Newer local wins wholesale (covers deletes) unless this device is still on
 * an older revision — then take remote as the snapshot and only append
 * local-only ids.
 */
export function mergeMessagesForHydrate<T extends { id: string }>(
  localMessages: T[],
  remoteMessages: T[],
  localUpdatedAt: string | null | undefined,
  remoteUpdatedAt: string | null | undefined,
  localRevision?: number | null,
  remoteRevision?: number | null,
): T[] {
  if (localRevisionIsBehind(localRevision, remoteRevision)) {
    return appendChatMessages(remoteMessages, localMessages);
  }
  if (localUpdatedAt && remoteUpdatedAt && localUpdatedAt > remoteUpdatedAt) {
    return localMessages;
  }
  return appendChatMessages(remoteMessages, localMessages);
}
