import type { PropertyFactCard } from "../types";
import type { EvidenceStore } from "../interfaces";

/** In-memory store for tests and single-process short TTL. */
export class MemoryEvidenceStore implements EvidenceStore {
  private readonly map = new Map<string, { card: PropertyFactCard; expiresAt: number }>();

  constructor(private readonly ttlMs = 60 * 60_000) {}

  async get(normalizedQuery: string): Promise<PropertyFactCard | null> {
    const hit = this.map.get(normalizedQuery);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.map.delete(normalizedQuery);
      return null;
    }
    return hit.card;
  }

  async set(normalizedQuery: string, card: PropertyFactCard): Promise<void> {
    this.map.set(normalizedQuery, {
      card,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.map.clear();
  }
}

/**
 * Postgres-backed store (Supabase `private.property_intel_cache`).
 * Reserved RedisEvidenceStore is not implemented in option A.
 */
export class PostgresEvidenceStore implements EvidenceStore {
  async get(normalizedQuery: string): Promise<PropertyFactCard | null> {
    try {
      const { getCachedPropertyFacts } = await import("../cache");
      return await getCachedPropertyFacts(normalizedQuery);
    } catch {
      return null;
    }
  }

  async set(normalizedQuery: string, card: PropertyFactCard): Promise<void> {
    try {
      const { setCachedPropertyFacts } = await import("../cache");
      await setCachedPropertyFacts(normalizedQuery, card);
    } catch {
      // ignore
    }
  }
}

/** Try Postgres first; fall back to no-op miss when admin client unavailable. */
export function createDefaultEvidenceStore(): EvidenceStore {
  return new PostgresEvidenceStore();
}
