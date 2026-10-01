export const CHAT_REACTIONS = ["👍", "❤️", "😂", "😮", "✅"] as const;

export type ChatReactionEmoji = (typeof CHAT_REACTIONS)[number];

export type ChatReaction = {
  emoji: ChatReactionEmoji;
  userId: string;
};

export function isChatReactionEmoji(value: string): value is ChatReactionEmoji {
  return (CHAT_REACTIONS as readonly string[]).includes(value);
}

export function toggleChatReaction(
  current: ChatReaction[] | undefined,
  emoji: ChatReactionEmoji,
  userId: string,
): ChatReaction[] {
  const reactions = current ?? [];
  const exists = reactions.some((item) => item.emoji === emoji && item.userId === userId);
  if (exists) return reactions.filter((item) => !(item.emoji === emoji && item.userId === userId));
  return [...reactions, { emoji, userId }];
}
