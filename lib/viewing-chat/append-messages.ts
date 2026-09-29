type MediaLike = { id?: string; path?: string | null };

function mediaId(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const id = (item as MediaLike).id;
  return typeof id === "string" && id ? id : null;
}

/** Keep a storage path that a later copy of the same attachment omitted. */
function mergeMedia(current: unknown, incoming: unknown): unknown {
  const currentItems = Array.isArray(current) ? current : [];
  const incomingItems = Array.isArray(incoming) ? incoming : [];
  if (incomingItems.length === 0) return currentItems.length > 0 ? currentItems : incoming;
  const merged = [...currentItems];
  const indexById = new Map<string, number>();
  merged.forEach((item, index) => {
    const id = mediaId(item);
    if (id) indexById.set(id, index);
  });
  for (const item of incomingItems) {
    const id = mediaId(item);
    if (!id) {
      merged.push(item);
      continue;
    }
    const index = indexById.get(id);
    if (index === undefined) {
      indexById.set(id, merged.length);
      merged.push(item);
      continue;
    }
    const prior = merged[index] as MediaLike;
    const next = item as MediaLike;
    merged[index] = { ...prior, ...next, path: next.path || prior.path || null };
  }
  return merged;
}

function mergeMessage<T extends { id: string }>(current: T, incoming: T): T {
  const next = { ...current, ...incoming };
  const incomingMedia = (incoming as { media?: unknown }).media;
  if (incomingMedia === undefined) return next;
  (next as { media?: unknown }).media = mergeMedia((current as { media?: unknown }).media, incomingMedia);
  return next;
}

export function appendChatMessages<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const indexById = new Map<string, number>();
  existing.forEach((message, index) => {
    if (message?.id) indexById.set(message.id, index);
  });
  const merged = [...existing];
  for (const message of incoming) {
    if (!message?.id) continue;
    const index = indexById.get(message.id);
    if (index === undefined) {
      indexById.set(message.id, merged.length);
      merged.push(message);
      continue;
    }
    merged[index] = mergeMessage(merged[index]!, message);
  }
  return merged;
}
