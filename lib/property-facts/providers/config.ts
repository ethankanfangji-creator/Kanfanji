import {
  PROPERTY_PROVIDER_DEFS,
  type PropertyProviderDef,
} from "@/config/property-providers";
import type { ProviderSkipReason } from "./types";

export type LoadedProviderConfig = PropertyProviderDef & {
  /** Rejected at load when allowsScraping is not false */
  loadError?: ProviderSkipReason;
};

/**
 * Load provider catalogue. Any entry with allowsScraping !== false is rejected.
 */
export function loadProviderDefs(
  defs: PropertyProviderDef[] = PROPERTY_PROVIDER_DEFS,
): LoadedProviderConfig[] {
  return defs.map((def) => {
    if ((def as { allowsScraping?: boolean }).allowsScraping !== false) {
      return {
        ...def,
        allowsScraping: false,
        enabledByDefault: false,
        stubOnly: true,
        loadError: "scraping_forbidden",
      };
    }
    return { ...def };
  });
}

export function readEnvKey(envKeyName: string | null): string | null {
  if (!envKeyName) return null;
  const value = process.env[envKeyName]?.trim();
  return value || null;
}

export function cacheTtlHoursForProvider(
  providerId: string,
  defs: LoadedProviderConfig[] = loadProviderDefs(),
): number | null {
  const hit = defs.find((d) => d.id === providerId);
  return hit?.retentionHours ?? null;
}
