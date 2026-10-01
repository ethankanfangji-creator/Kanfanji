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
