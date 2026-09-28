import { createHash } from "node:crypto";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizeCompareItemIds(itemIds: string[]): string[] | null {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of itemIds) {
    const id = raw.trim();
    if (!ID_PATTERN.test(id) || seen.has(id)) {
      if (!ID_PATTERN.test(id)) return null;
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  ids.sort();
  return ids;
}

export function compareKey(userId: string, source: string, itemIds: string[]): string {
  const ids = normalizeCompareItemIds(itemIds);
  if (!ids) throw new Error("invalid compare ids");
  return createHash("sha256").update(`cmp:v1:${userId}:${source}:${ids.join(",")}`).digest("hex");
}
