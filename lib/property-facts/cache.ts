import { createAdminClient } from "@/utils/supabase/admin";
import { cacheTtlHours, propertyIntelCacheKey } from "@/lib/property-intel/cache-key";
import { addressCacheMaterial } from "@/lib/property-intel/normalize-query";
import type { PropertyFactCard } from "./types";

function tryAdmin() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

function isFactCard(payload: unknown): payload is PropertyFactCard {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  return (
    typeof obj.region === "string" &&
    obj.identity != null &&
    typeof obj.identity === "object" &&
    obj.meta != null &&
    typeof obj.meta === "object"
  );
}

/** Read shared property-facts snapshot (reuses private.property_intel_cache). */
export async function getCachedPropertyFacts(
  address: string,
): Promise<PropertyFactCard | null> {
  const admin = tryAdmin();
  if (!admin) return null;
  const material = addressCacheMaterial(address);
  if (!material) return null;
  const cacheKey = `facts:v1:${propertyIntelCacheKey(address)}`;

  try {
    const { data, error } = await admin
      .schema("private")
      .from("property_intel_cache")
      .select("payload, expires_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (error || !data) return null;
    const expiresAt = new Date(String(data.expires_at)).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    if (!isFactCard(data.payload)) return null;
    return data.payload;
  } catch {
    return null;
  }
}

export async function setCachedPropertyFacts(
  address: string,
  card: PropertyFactCard,
): Promise<void> {
  const admin = tryAdmin();
  if (!admin) return;
  const material = addressCacheMaterial(address);
  if (!material) return;
  const cacheKey = `facts:v1:${propertyIntelCacheKey(address)}`;
  const hours = cacheTtlHours();
  const expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();

  try {
    await admin.schema("private").from("property_intel_cache").upsert(
      {
        cache_key: cacheKey,
        normalized_address: material.slice(0, 500),
        payload: card,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" },
    );
  } catch {
    // ignore
  }
}
