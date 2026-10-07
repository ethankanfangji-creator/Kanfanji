import { appendChatMessages } from "@/lib/viewing-chat/append-messages";

/**
 * Merge cloud + local messages without resurrecting locally-deleted notes.
 * Newer local wins wholesale (covers deletes). Otherwise take remote as the
 * base and only append local ids the cloud has never seen.
 */
export function mergeMessagesForHydrate<T extends { id: string }>(
  localMessages: T[],
  remoteMessages: T[],
  localUpdatedAt: string | null | undefined,
  remoteUpdatedAt: string | null | undefined,
): T[] {
  if (localUpdatedAt && remoteUpdatedAt && localUpdatedAt > remoteUpdatedAt) {
    return localMessages;
  }
  return appendChatMessages(remoteMessages, localMessages);
}
