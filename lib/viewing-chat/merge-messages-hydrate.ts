/**
 * Merge cloud + local messages without resurrecting deleted notes.
 * Newer local wins wholesale (covers in-flight local deletes/edits).
 * Otherwise the remote owner snapshot replaces the list — appending
 * local-only ids would bring back notes another device already removed.
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
  return remoteMessages;
}
