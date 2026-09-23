/**
 * Property data provider contracts — licensed / official APIs only.
 * Scraping MLS, broker sites, or government portals is out of scope.
 */

import type { PropertyProviderDef } from "@/config/property-providers";
import type { Evidence, LaneContext, PropertyRegion } from "../types";

export type ProviderSkipReason =
  | "missing_key"
  | "disabled"
  | "out_of_region"
  | "stub_only"
  | "scraping_forbidden"
  | "invalid_config";

export type ProviderAvailability = {
  id: string;
  available: boolean;
  reason?: ProviderSkipReason;
  def: PropertyProviderDef;
};

export type PropertyDataProvider = {
  id: string;
  def: PropertyProviderDef;
  isAvailable(region?: PropertyRegion): ProviderAvailability;
  /** Optional fetch hook — most lanes still call domain helpers gated by registry. */
  fetch?(ctx: LaneContext): Promise<Evidence<unknown>[]>;
};

export type ProviderAuditEntryUsed = {
  id: string;
  kind: PropertyProviderDef["kind"];
  auth_scope: string;
};

export type ProviderAuditEntrySkipped = {
  id: string;
  reason: ProviderSkipReason;
};

/** Mutable per-assemble audit trail. */
export type ProviderAudit = {
  used: Map<string, ProviderAuditEntryUsed>;
  skipped: Map<string, ProviderAuditEntrySkipped>;
  markUsed: (def: PropertyProviderDef) => void;
  markSkipped: (def: PropertyProviderDef, reason: ProviderSkipReason) => void;
  snapshot: () => {
    used: ProviderAuditEntryUsed[];
    skipped: ProviderAuditEntrySkipped[];
  };
};

export function createProviderAudit(): ProviderAudit {
  const used = new Map<string, ProviderAuditEntryUsed>();
  const skipped = new Map<string, ProviderAuditEntrySkipped>();
  return {
    used,
    skipped,
    markUsed(def) {
      skipped.delete(def.id);
      used.set(def.id, {
        id: def.id,
        kind: def.kind,
        auth_scope: def.authScope,
      });
    },
    markSkipped(def, reason) {
      if (used.has(def.id)) return;
      skipped.set(def.id, { id: def.id, reason });
    },
    snapshot() {
      return {
        used: [...used.values()],
        skipped: [...skipped.values()],
      };
    },
  };
}
