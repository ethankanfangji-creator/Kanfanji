/**
 * Property data compliance audit (generate / erase / purge / llm_export).
 */

import { createAdminClient } from "@/utils/supabase/admin";

export type PropertyAuditAction =
  | "generate"
  | "read"
  | "erase"
  | "purge_expired"
  | "llm_export";

export type PropertyAuditActor = "system" | "user" | "guest" | null;

export type PropertyAuditEvent = {
  at: string;
  actor: PropertyAuditActor;
  action: PropertyAuditAction;
  reportId?: string | null;
  cacheKeyHash?: string | null;
  country?: string | null;
  meta?: Record<string, unknown>;
};

type MemoryAudit = PropertyAuditEvent & { id: string };

const memoryAudit: MemoryAudit[] = [];

function tryAdmin() {
  if (process.env.VITEST || process.env.PROPERTY_REPORT_MEMORY_STORE === "1") {
    return null;
  }
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

/** Test helper */
export function resetPropertyAuditMemory(): void {
  memoryAudit.length = 0;
}

export function getPropertyAuditMemory(): readonly MemoryAudit[] {
  return memoryAudit;
}

export async function recordPropertyAudit(
  event: Omit<PropertyAuditEvent, "at"> & { at?: string },
): Promise<void> {
  const row: MemoryAudit = {
    id: `aud_${memoryAudit.length + 1}`,
    at: event.at ?? new Date().toISOString(),
    actor: event.actor,
    action: event.action,
    reportId: event.reportId ?? null,
    cacheKeyHash: event.cacheKeyHash ?? null,
    country: event.country ?? null,
    meta: event.meta ?? {},
  };
  memoryAudit.push(row);
  if (memoryAudit.length > 500) memoryAudit.shift();

  const admin = tryAdmin();
  if (!admin) return;
  try {
    await admin.schema("private").from("property_data_audit").insert({
      actor: row.actor,
      action: row.action,
      report_id: row.reportId,
      cache_key_hash: row.cacheKeyHash,
      country_code: row.country,
      meta: row.meta,
      created_at: row.at,
    });
  } catch {
    // non-fatal
  }
}
