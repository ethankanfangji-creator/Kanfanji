import { createAdminClient } from "@/utils/supabase/admin";
import { cacheTtlHours, propertyIntelCacheKey } from "./cache-key";
import { addressCacheMaterial } from "./normalize-query";
import type { PropertyIntel } from "./types";

function tryAdmin() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

/**
 * Read shared property-intel snapshot from private DB cache.
 * Soft-fails (returns null) when admin/DB unavailable — never blocks lookups.
 */
export async function getCachedPropertyIntel(
  address: string,
): Promise<PropertyIntel | null> {
  const admin = tryAdmin();
  if (!admin) return null;
  const material = addressCacheMaterial(address);
  if (!material) return null;
  const cacheKey = propertyIntelCacheKey(address);

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
    const payload = data.payload as PropertyIntel | null;
    if (!payload || typeof payload !== "object" || !payload.address) return null;
    return {
      ...payload,
      sources: [...new Set([...(payload.sources ?? []), "cache"])],
    };
  } catch {
    return null;
  }
}

/** Upsert intel for other users hitting the same normalized address. */
export async function setCachedPropertyIntel(
  address: string,
  intel: PropertyIntel,
): Promise<void> {
  const admin = tryAdmin();
  if (!admin) return;
  const material = addressCacheMaterial(address);
  if (!material) return;
  const cacheKey = propertyIntelCacheKey(address);

  const hours = cacheTtlHours();
  const expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();

  try {
    await admin.schema("private").from("property_intel_cache").upsert(
      {
        cache_key: cacheKey,
        normalized_address: material.slice(0, 500),
        payload: intel,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" },
    );
  } catch {
    // ignore cache write failures
  }
}
