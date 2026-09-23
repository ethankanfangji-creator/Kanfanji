import { createHash } from "node:crypto";
import { addressCacheMaterial } from "./normalize-query";

export function propertyIntelCacheKey(address: string): string {
  const material = addressCacheMaterial(address);
  return createHash("sha256").update(material, "utf8").digest("hex");
}

export function cacheTtlHours(): number {
  const raw = Number(process.env.PROPERTY_INTEL_CACHE_TTL_HOURS ?? "168");
  if (!Number.isFinite(raw) || raw < 1) return 168;
  return Math.min(Math.floor(raw), 24 * 90);
}
