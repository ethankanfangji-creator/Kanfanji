import type { PropertyRegion } from "../types";
import { loadProviderDefs, readEnvKey, type LoadedProviderConfig } from "./config";
import type {
  ProviderAudit,
  ProviderAvailability,
  ProviderSkipReason,
} from "./types";

let cachedDefs: LoadedProviderConfig[] | null = null;

export function getProviderDefs(): LoadedProviderConfig[] {
  if (!cachedDefs) cachedDefs = loadProviderDefs();
  return cachedDefs;
}

/** Test helper */
export function resetProviderRegistryForTests(): void {
  cachedDefs = null;
}

export function getProviderDef(id: string): LoadedProviderConfig | null {
  return getProviderDefs().find((d) => d.id === id) ?? null;
}

/**
 * Resolve availability for a provider in an optional region.
 * Does not mutate audit — callers should record via gateProvider.
 */
export function resolveProviderAvailability(
  id: string,
  region?: PropertyRegion,
): ProviderAvailability | null {
  const def = getProviderDef(id);
  if (!def) return null;

  if (def.loadError) {
    return { id, available: false, reason: def.loadError, def };
  }
  if (def.stubOnly) {
    return { id, available: false, reason: "stub_only", def };
  }
  if (!def.enabledByDefault) {
    return { id, available: false, reason: "disabled", def };
  }
  if (region && def.regions.length && !def.regions.includes(region)) {
    return { id, available: false, reason: "out_of_region", def };
  }
  if (def.envKeyName && !readEnvKey(def.envKeyName)) {
    return { id, available: false, reason: "missing_key", def };
  }
  return { id, available: true, def };
}

/**
 * Gate an outbound call. Records used/skipped on audit when provided.
 * Returns true only when the provider may be called.
 */
export function gateProvider(
  id: string,
  opts?: { region?: PropertyRegion; audit?: ProviderAudit },
): boolean {
  const availability = resolveProviderAvailability(id, opts?.region);
  if (!availability) {
    return false;
  }
  if (!availability.available) {
    opts?.audit?.markSkipped(
      availability.def,
      availability.reason ?? ("invalid_config" satisfies ProviderSkipReason),
    );
    return false;
  }
  opts?.audit?.markUsed(availability.def);
  return true;
}

/** Snapshot of all catalogue entries for compliance reporting. */
export function auditAllProviders(
  region: PropertyRegion | undefined,
  audit: ProviderAudit,
): void {
  for (const def of getProviderDefs()) {
    if (audit.used.has(def.id) || audit.skipped.has(def.id)) continue;
    const availability = resolveProviderAvailability(def.id, region);
    if (!availability?.available) {
      audit.markSkipped(
        def,
        availability?.reason ?? "invalid_config",
      );
    }
  }
}
