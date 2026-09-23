/**
 * Retention TTL + purge of expired property report / evidence / intel cache rows.
 */

import { createAdminClient } from "@/utils/supabase/admin";
import { cacheTtlHours } from "@/lib/property-intel/cache-key";
import { recordPropertyAudit } from "./audit";

export function propertyReportTtlHours(): number {
  const raw = Number(process.env.PROPERTY_REPORT_TTL_HOURS ?? cacheTtlHours());
  if (!Number.isFinite(raw) || raw < 1) return cacheTtlHours();
  return Math.min(Math.floor(raw), 24 * 90);
}

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

export type PurgeExpiredResult = {
  reportsDeleted: number;
  evidenceDeleted: number;
  intelCacheDeleted: number;
};

/**
 * Delete expired snapshots. Safe to run periodically.
 */
export async function purgeExpiredPropertyData(): Promise<PurgeExpiredResult> {
  const admin = tryAdmin();
  const result: PurgeExpiredResult = {
    reportsDeleted: 0,
    evidenceDeleted: 0,
    intelCacheDeleted: 0,
  };
  if (!admin) {
    await recordPropertyAudit({
      actor: "system",
      action: "purge_expired",
      meta: { mode: "memory_skip", ...result },
    });
    return result;
  }

  const now = new Date().toISOString();
  try {
    const { data: expiredReports } = await admin
      .schema("private")
      .from("property_domain_reports")
      .select("id")
      .lt("expires_at", now);
    const ids = (expiredReports ?? []).map((r) => String(r.id));
    if (ids.length) {
      await admin.schema("private").from("property_evidence").delete().in("report_id", ids);
      const { count } = await admin
        .schema("private")
        .from("property_domain_reports")
        .delete({ count: "exact" })
        .lt("expires_at", now);
      result.reportsDeleted = count ?? ids.length;
      result.evidenceDeleted = ids.length;
    }

    const { count: evCount } = await admin
      .schema("private")
      .from("property_evidence")
      .delete({ count: "exact" })
      .lt("expires_at", now)
      .is("report_id", null);
    result.evidenceDeleted += evCount ?? 0;

    const { count: cacheCount } = await admin
      .schema("private")
      .from("property_intel_cache")
      .delete({ count: "exact" })
      .lt("expires_at", now);
    result.intelCacheDeleted = cacheCount ?? 0;
  } catch {
    // ignore partial failures
  }

  await recordPropertyAudit({
    actor: "system",
    action: "purge_expired",
    meta: result,
  });
  return result;
}
