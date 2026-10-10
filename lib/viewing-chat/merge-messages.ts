import { isChatReactionEmoji, type ChatReaction } from "@/lib/viewing-chat/chat-reactions";
import type { ChatMessage } from "@/lib/viewing-chat/types";
import { appendChatMessages } from "@/lib/viewing-chat/append-messages";

function reactionsOf(message: ChatMessage): ChatReaction[] | undefined {
  if (!Array.isArray(message.reactions)) return undefined;
  const kept = message.reactions.filter(
    (item): item is ChatReaction =>
      Boolean(item) &&
      typeof item.userId === "string" &&
      typeof item.emoji === "string" &&
      isChatReactionEmoji(item.emoji),
  );
  return kept;
}

/** Keep existing messages, apply reaction edits, then append new replies. */
export function mergeChatMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const incomingById = new Map(incoming.map((message) => [message.id, message]));
  const updated = existing.map((message) => {
    const next = incomingById.get(message.id);
    if (!next) return message;
    const reactions = reactionsOf(next);
    if (!reactions) return message;
    return { ...message, reactions };
  });
  return appendChatMessages(updated, incoming);
}

/**
 * Owner notes are a snapshot: edits and deletes must replace the cloud list.
 * Collaborators stay append-only so they cannot wipe the owner's notes.
 */
export function resolveThreadMessages(input: {
  isOwner: boolean;
  existing: ChatMessage[];
  incoming: ChatMessage[];
}): ChatMessage[] {
  if (input.isOwner) return input.incoming;
  return mergeChatMessages(input.existing, input.incoming);
}

export function localRevisionIsBehind(
  localRevision: number | null | undefined,
  remoteRevision: number | null | undefined,
): boolean {
  return (
    typeof localRevision === "number" &&
    typeof remoteRevision === "number" &&
    localRevision < remoteRevision
  );
}

export function localNotesAreAuthoritative(input: {
  hasLocalMessages: boolean;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  localCloudState?: string | null;
  localRevision?: number | null;
  remoteRevision?: number | null;
}): boolean {
  if (!input.hasLocalMessages) return false;
  // A metadata-only bump (star / tags) can make the local clock newer while
  // this device is still on an older snapshot. Those writes must not hide
  // notes another device already committed.
  if (localRevisionIsBehind(input.localRevision, input.remoteRevision)) {
    return false;
  }
  return (
    input.localCloudState === "syncing" ||
    input.localCloudState === "failed" ||
    (Boolean(input.localUpdatedAt) &&
      Boolean(input.remoteUpdatedAt) &&
      input.localUpdatedAt! > input.remoteUpdatedAt!)
  );
}

/** Prefer unsynced local notes so a refresh cannot resurrect a deleted/edited note. */
export function hydrateThreadMessages(input: {
  localMessages?: ChatMessage[];
  remoteMessages?: ChatMessage[];
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  localCloudState?: string | null;
  localRevision?: number | null;
  remoteRevision?: number | null;
}): ChatMessage[] {
  const remote = input.remoteMessages ?? [];
  if (!input.localMessages) return remote;
  if (
    localNotesAreAuthoritative({
      hasLocalMessages: true,
      localUpdatedAt: input.localUpdatedAt,
      remoteUpdatedAt: input.remoteUpdatedAt,
      localCloudState: input.localCloudState,
      localRevision: input.localRevision,
      remoteRevision: input.remoteRevision,
    })
  ) {
    return input.localMessages;
  }
  return appendChatMessages(remote, input.localMessages);
}
