/**
 * Erase property report snapshots + evidence by reportId or address.
 *
 * HTTP callers must pass `actorUserId` (authenticated user). That scopes deletes
 * to snapshots that user created and never wipes the shared intel cache.
 * Omitting `actorUserId` is for tests / internal jobs and keeps global behavior.
 */

import { createHash } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { AiInputError } from "@/lib/ai-boundary/validation";
import { propertyIntelCacheKey } from "@/lib/property-intel/cache-key";
import { addressCacheMaterial } from "@/lib/property-intel/normalize-query";
import { recordPropertyAudit, type PropertyAuditActor } from "./audit";
import { eraseMemoryReport, reportCacheKeyForAddress } from "./persist-report";

export type ErasePropertyDataInput = {
  reportId?: string;
  address?: string;
  cacheKey?: string;
  actor?: PropertyAuditActor;
  /** Authenticated user id. When set, only that user's snapshots are deleted. */
  actorUserId?: string;
};

export type ErasePropertyDataResult = {
  ok: true;
  reportIds: string[];
  deletedReports: number;
  deletedEvidence: number;
  deletedIntelCache: number;
};

export function requireAuthenticatedEraseUser(userId: string | null | undefined): string {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new AiInputError("ai_auth_required", 401);
  }
  return userId.trim();
}

/** Shared intel cache is not per-user. Only an unscoped erase may drop it. */
export function eraseDeletesSharedIntelCache(actorUserId: string | undefined): boolean {
  return !actorUserId;
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

export async function erasePropertyData(
  input: ErasePropertyDataInput,
): Promise<ErasePropertyDataResult> {
  if (!input.reportId && !input.address && !input.cacheKey) {
    return {
      ok: true,
      reportIds: [],
      deletedReports: 0,
      deletedEvidence: 0,
      deletedIntelCache: 0,
    };
  }

  const actorUserId =
    typeof input.actorUserId === "string" && input.actorUserId.trim()
      ? input.actorUserId.trim()
      : undefined;

  const admin = tryAdmin();
  if (!admin) {
    const erased = eraseMemoryReport({
      reportId: input.reportId,
      cacheKey:
        input.cacheKey ||
        (input.address ? reportCacheKeyForAddress(input.address) : undefined),
      createdBy: actorUserId,
    });
    if (actorUserId && input.reportId && erased.deletedReports === 0) {
      throw new AiInputError("report_not_found", 404);
    }
    await recordPropertyAudit({
      actor: input.actor ?? "system",
      action: "erase",
      reportId: erased.reportIds[0] ?? input.reportId ?? null,
      cacheKeyHash: input.cacheKey
        ? createHash("sha256").update(input.cacheKey).digest("hex").slice(0, 16)
        : null,
      meta: { mode: "memory", actorUserId: actorUserId ?? null, ...erased },
    });
    return {
      ok: true,
      reportIds: erased.reportIds,
      deletedReports: erased.deletedReports,
      deletedEvidence: erased.deletedEvidence,
      deletedIntelCache: 0,
    };
  }

  const reportIds: string[] = [];
  const cacheKeys = new Set<string>();

  if (input.cacheKey) cacheKeys.add(input.cacheKey);
  if (input.address && addressCacheMaterial(input.address)) {
    cacheKeys.add(reportCacheKeyForAddress(input.address));
    cacheKeys.add(`facts:v1:${propertyIntelCacheKey(input.address)}`);
  }

  if (input.reportId) {
    const { data } = await admin
      .schema("private")
      .from("property_domain_reports")
      .select("id, cache_key, created_by")
      .eq("id", input.reportId)
      .maybeSingle();
    if (actorUserId && (!data || String(data.created_by ?? "") !== actorUserId)) {
      throw new AiInputError("report_not_found", 404);
    }
    if (data) {
      reportIds.push(String(data.id));
    }
  }

  for (const key of cacheKeys) {
    if (key.startsWith("report:")) {
      let query = admin
        .schema("private")
        .from("property_domain_reports")
        .select("id")
        .eq("cache_key", key);
      if (actorUserId) {
        query = query.eq("created_by", actorUserId);
      }
      const { data } = await query;
      for (const row of data ?? []) reportIds.push(String(row.id));
    }
  }

  const uniqueIds = [...new Set(reportIds)];
  let deletedEvidence = 0;
  let deletedReports = 0;
  let deletedIntelCache = 0;

  if (uniqueIds.length) {
    const { count: ev } = await admin
      .schema("private")
      .from("property_evidence")
      .delete({ count: "exact" })
      .in("report_id", uniqueIds);
    deletedEvidence = ev ?? 0;
    const { count: rp } = await admin
      .schema("private")
      .from("property_domain_reports")
      .delete({ count: "exact" })
      .in("id", uniqueIds);
    deletedReports = rp ?? 0;
  }

  if (eraseDeletesSharedIntelCache(actorUserId)) {
    for (const key of cacheKeys) {
      if (key.startsWith("facts:")) {
        const { count } = await admin
          .schema("private")
          .from("property_intel_cache")
          .delete({ count: "exact" })
          .eq("cache_key", key);
        deletedIntelCache += count ?? 0;
      }
    }
  }

  const firstKey = [...cacheKeys][0];
  await recordPropertyAudit({
    actor: input.actor ?? "user",
    action: "erase",
    reportId: uniqueIds[0] ?? null,
    cacheKeyHash: firstKey
      ? createHash("sha256").update(firstKey).digest("hex").slice(0, 16)
      : null,
    meta: {
      deletedReports,
      deletedEvidence,
      deletedIntelCache,
      reportIds: uniqueIds,
      actorUserId: actorUserId ?? null,
    },
  });

  return {
    ok: true,
    reportIds: uniqueIds,
    deletedReports,
    deletedEvidence,
    deletedIntelCache,
  };
}
