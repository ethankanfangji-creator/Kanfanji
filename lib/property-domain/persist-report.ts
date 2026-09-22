/**
 * Persist / load property-report API snapshots (Postgres + in-memory fallback for tests).
 */

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { propertyIntelCacheKey } from "@/lib/property-intel/cache-key";
import { addressCacheMaterial } from "@/lib/property-intel/normalize-query";
import type { PropertyReport, ReportEvidenceItem } from "@/lib/property-facts/report-types";
import type { DomainPropertyReport } from "./models";
import type { GeneratePropertyReportResult, GeneratePropertyReportStages } from "./generate-property-report";
import { propertyReportTtlHours } from "./retention";

export const PROPERTY_REPORT_API_SCHEMA = "property-report-api/v1" as const;

export type PropertyReportCacheInfo = {
  hit: boolean;
  key: string;
  expiresAt: string;
  stale?: boolean;
};

export type PropertyReportApiEnvelope = {
  schemaVersion: typeof PROPERTY_REPORT_API_SCHEMA;
  stages: GeneratePropertyReportStages;
  report: PropertyReport | null;
  domainReport: DomainPropertyReport | null;
  markdown: string | null;
  normalizedAddress: string;
  country: string;
  cacheKey: string;
};

export type PersistedPropertyReport = {
  reportId: string;
  cache: PropertyReportCacheInfo;
  envelope: PropertyReportApiEnvelope;
};

type MemoryRow = {
  id: string;
  cache_key: string;
  normalized_address: string;
  country_code: string;
  schema_version: string;
  report: PropertyReportApiEnvelope;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  evidence: ReportEvidenceItem[];
};

const memoryById = new Map<string, MemoryRow>();
const memoryByCacheKey = new Map<string, string[]>();

function tryAdmin() {
  // Tests / local must not hang on remote Supabase.
  if (process.env.VITEST || process.env.PROPERTY_REPORT_MEMORY_STORE === "1") {
    return null;
  }
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

export function reportCacheKeyForAddress(address: string): string {
  return `report:v1:${propertyIntelCacheKey(address)}`;
}

export function defaultReportExpiresAt(now = Date.now()): string {
  return new Date(now + propertyReportTtlHours() * 3600_000).toISOString();
}

function remember(row: MemoryRow) {
  memoryById.set(row.id, row);
  const list = memoryByCacheKey.get(row.cache_key) ?? [];
  memoryByCacheKey.set(row.cache_key, [row.id, ...list.filter((id) => id !== row.id)]);
}

/** Test helper */
export function resetPropertyReportMemoryStore(): void {
  memoryById.clear();
  memoryByCacheKey.clear();
}

function ownsMemoryRow(row: MemoryRow | undefined, createdBy?: string): boolean {
  if (!row) return false;
  if (!createdBy) return true;
  return row.created_by === createdBy;
}

/** Selective in-memory erase for compliance tests / local fallback. */
export function eraseMemoryReport(input: {
  reportId?: string;
  cacheKey?: string;
  createdBy?: string;
}): { reportIds: string[]; deletedReports: number; deletedEvidence: number } {
  const toDelete = new Set<string>();
  if (input.reportId) {
    const row = memoryById.get(input.reportId);
    if (ownsMemoryRow(row, input.createdBy)) {
      toDelete.add(input.reportId);
    }
  }
  if (input.cacheKey) {
    for (const id of memoryByCacheKey.get(input.cacheKey) ?? []) {
      if (ownsMemoryRow(memoryById.get(id), input.createdBy)) {
        toDelete.add(id);
      }
    }
  }
  let deletedEvidence = 0;
  for (const id of toDelete) {
    const row = memoryById.get(id);
    if (row) deletedEvidence += row.evidence.length;
    memoryById.delete(id);
  }
  for (const [key, ids] of memoryByCacheKey.entries()) {
    const next = ids.filter((id) => !toDelete.has(id));
    if (next.length) memoryByCacheKey.set(key, next);
    else memoryByCacheKey.delete(key);
  }
  return {
    reportIds: [...toDelete],
    deletedReports: toDelete.size,
    deletedEvidence,
  };
}

export function buildEnvelopeFromGenerateResult(
  result: GeneratePropertyReportResult,
  cacheKey: string,
): PropertyReportApiEnvelope {
  return {
    schemaVersion: PROPERTY_REPORT_API_SCHEMA,
    stages: result.stages,
    report: result.report,
    domainReport: result.domainReport,
    markdown: result.markdown,
    normalizedAddress: result.normalizedQuery,
    country: result.stages.country,
    cacheKey,
  };
}

function isEnvelope(payload: unknown): payload is PropertyReportApiEnvelope {
  if (!payload || typeof payload !== "object") return false;
  const o = payload as Record<string, unknown>;
  return o.schemaVersion === PROPERTY_REPORT_API_SCHEMA && typeof o.cacheKey === "string";
}

/**
 * Latest non-expired snapshot for cache key, or null.
 */
export async function getLatestReportByCacheKey(
  cacheKey: string,
): Promise<PersistedPropertyReport | null> {
  const admin = tryAdmin();
  if (!admin) {
    const ids = memoryByCacheKey.get(cacheKey) ?? [];
    for (const id of ids) {
      const row = memoryById.get(id);
      if (!row) continue;
      const expiresAt = new Date(row.expires_at).getTime();
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) continue;
      return {
        reportId: row.id,
        cache: { hit: true, key: cacheKey, expiresAt: row.expires_at, stale: false },
        envelope: row.report,
      };
    }
    return null;
  }

  try {
    const { data, error } = await admin
      .schema("private")
      .from("property_domain_reports")
      .select("id, cache_key, report, expires_at")
      .eq("cache_key", cacheKey)
      .eq("schema_version", PROPERTY_REPORT_API_SCHEMA)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data || !isEnvelope(data.report)) return null;
    return {
      reportId: String(data.id),
      cache: {
        hit: true,
        key: cacheKey,
        expiresAt: String(data.expires_at),
        stale: false,
      },
      envelope: data.report,
    };
  } catch {
    return null;
  }
}

export async function getReportById(reportId: string): Promise<PersistedPropertyReport | null> {
  const admin = tryAdmin();
  if (!admin) {
    const row = memoryById.get(reportId);
    if (!row || !isEnvelope(row.report)) return null;
    const expiresAtMs = new Date(row.expires_at).getTime();
    const stale = !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now();
    return {
      reportId: row.id,
      cache: {
        hit: true,
        key: row.cache_key,
        expiresAt: row.expires_at,
        stale,
      },
      envelope: row.report,
    };
  }

  try {
    const { data, error } = await admin
      .schema("private")
      .from("property_domain_reports")
      .select("id, cache_key, report, expires_at")
      .eq("id", reportId)
      .maybeSingle();

    if (error || !data || !isEnvelope(data.report)) return null;
    const expiresAtMs = new Date(String(data.expires_at)).getTime();
    const stale = !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now();
    return {
      reportId: String(data.id),
      cache: {
        hit: true,
        key: String(data.cache_key),
        expiresAt: String(data.expires_at),
        stale,
      },
      envelope: data.report,
    };
  } catch {
    return null;
  }
}

export async function persistPropertyReport(input: {
  address: string;
  envelope: PropertyReportApiEnvelope;
  evidence?: ReportEvidenceItem[];
  createdBy?: string | null;
}): Promise<PersistedPropertyReport> {
  const material = addressCacheMaterial(input.address) || input.envelope.normalizedAddress;
  const cacheKey = input.envelope.cacheKey || reportCacheKeyForAddress(input.address);
  const expiresAt = defaultReportExpiresAt();
  const now = new Date().toISOString();
  const evidence = input.evidence ?? input.envelope.report?.evidence ?? [];

  const envelope: PropertyReportApiEnvelope = {
    ...input.envelope,
    cacheKey,
    normalizedAddress: input.envelope.normalizedAddress || material.slice(0, 500),
  };

  const createdBy =
    typeof input.createdBy === "string" && input.createdBy.trim()
      ? input.createdBy.trim()
      : null;

  const admin = tryAdmin();
  if (!admin) {
    const id = randomUUID();
    const row: MemoryRow = {
      id,
      cache_key: cacheKey,
      normalized_address: envelope.normalizedAddress.slice(0, 500),
      country_code: envelope.country,
      schema_version: PROPERTY_REPORT_API_SCHEMA,
      report: envelope,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
      expires_at: expiresAt,
      evidence,
    };
    remember(row);
    return {
      reportId: id,
      cache: { hit: false, key: cacheKey, expiresAt, stale: false },
      envelope,
    };
  }

  try {
    const { data, error } = await admin
      .schema("private")
      .from("property_domain_reports")
      .insert({
        cache_key: cacheKey,
        normalized_address: envelope.normalizedAddress.slice(0, 500),
        country_code: envelope.country,
        schema_version: PROPERTY_REPORT_API_SCHEMA,
        report: envelope,
        created_by: createdBy,
        expires_at: expiresAt,
        updated_at: now,
      })
      .select("id, expires_at")
      .single();

    if (error || !data) throw error ?? new Error("persist failed");

    const reportId = String(data.id);
    if (evidence.length) {
      await admin.schema("private").from("property_evidence").delete().eq("report_id", reportId);
      const rows = evidence.map((ev) => ({
        report_id: reportId,
        evidence_id: ev.id,
        field_path: ev.field,
        payload: ev,
        confidence: ev.confidence,
        retrieved_at: ev.retrieved_at,
        effective_date: ev.effective_date,
        expires_at: expiresAt,
      }));
      await admin.schema("private").from("property_evidence").insert(rows);
    }

    return {
      reportId,
      cache: {
        hit: false,
        key: cacheKey,
        expiresAt: String(data.expires_at ?? expiresAt),
        stale: false,
      },
      envelope,
    };
  } catch {
    // Fall back to memory so local/dev without tables still returns a reportId
    const id = randomUUID();
    remember({
      id,
      cache_key: cacheKey,
      normalized_address: envelope.normalizedAddress.slice(0, 500),
      country_code: envelope.country,
      schema_version: PROPERTY_REPORT_API_SCHEMA,
      report: envelope,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
      expires_at: expiresAt,
      evidence,
    });
    return {
      reportId: id,
      cache: { hit: false, key: cacheKey, expiresAt, stale: false },
      envelope,
    };
  }
}

export async function getEvidenceByReport(
  reportId: string,
  evidenceId: string,
): Promise<ReportEvidenceItem | null> {
  const admin = tryAdmin();
  if (!admin) {
    const row = memoryById.get(reportId);
    if (!row) return null;
    return row.evidence.find((e) => e.id === evidenceId) ??
      row.report.report?.evidence.find((e) => e.id === evidenceId) ??
      null;
  }

  try {
    const { data, error } = await admin
      .schema("private")
      .from("property_evidence")
      .select("payload")
      .eq("report_id", reportId)
      .eq("evidence_id", evidenceId)
      .maybeSingle();

    if (!error && data?.payload && typeof data.payload === "object") {
      return data.payload as ReportEvidenceItem;
    }
  } catch {
    // fall through to envelope
  }

  const persisted = await getReportById(reportId);
  return persisted?.envelope.report?.evidence.find((e) => e.id === evidenceId) ?? null;
}

export type PropertyReportApiResponseBody = {
  reportId: string;
  cache: PropertyReportCacheInfo;
  stages: GeneratePropertyReportStages;
  report: PropertyReport | null;
  domainReport: DomainPropertyReport | null;
  markdown: string | null;
  factCard: unknown | null;
  links: {
    self: string;
    evidenceBase: string;
  };
};

export function toApiResponseBody(
  persisted: PersistedPropertyReport,
  opts?: {
    includeMarkdown?: boolean;
    includeLegacyReport?: boolean;
    includeDomainReport?: boolean;
    factCard?: unknown | null;
  },
): PropertyReportApiResponseBody {
  const includeMarkdown = opts?.includeMarkdown !== false;
  const includeLegacy = opts?.includeLegacyReport !== false;
  const includeDomain = opts?.includeDomainReport !== false;
  const env = persisted.envelope;
  return {
    reportId: persisted.reportId,
    cache: persisted.cache,
    stages: env.stages,
    report: includeLegacy ? env.report : null,
    domainReport: includeDomain ? env.domainReport : null,
    markdown: includeMarkdown ? env.markdown : null,
    factCard: opts?.factCard ?? null,
    links: {
      self: `/api/property-report/${persisted.reportId}`,
      evidenceBase: `/api/evidence/{evidenceId}?reportId=${persisted.reportId}`,
    },
  };
}
