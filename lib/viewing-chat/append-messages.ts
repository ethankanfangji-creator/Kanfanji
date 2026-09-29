export function appendChatMessages<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map((message) => message.id));
  const merged = [...existing];
  for (const message of incoming) {
    if (!message?.id || seen.has(message.id)) continue;
    seen.add(message.id);
    merged.push(message);
  }
  return merged;
}
