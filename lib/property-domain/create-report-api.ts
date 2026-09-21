/**
 * Orchestrate generate → persist (and optional L2 cache hit) for the property-report API.
 */

import { AiInputError } from "@/lib/ai-boundary/validation";
import { recordPropertyAudit } from "./audit";
import {
  generatePropertyReport,
  type GeneratePropertyReportOptions,
  type GeneratePropertyReportResult,
} from "./generate-property-report";
import {
  buildEnvelopeFromGenerateResult,
  getLatestReportByCacheKey,
  persistPropertyReport,
  reportCacheKeyForAddress,
  toApiResponseBody,
  type PersistedPropertyReport,
  type PropertyReportApiResponseBody,
} from "./persist-report";

export function propertyReportTimeoutMs(): number {
  const configured = Number(
    process.env.PROPERTY_REPORT_TIMEOUT_MS ?? process.env.AI_UPSTREAM_TIMEOUT_MS,
  );
  return Number.isFinite(configured)
    ? Math.max(15_000, Math.min(configured, 90_000))
    : 60_000;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error("property report timed out");
          err.name = "TimeoutError";
          reject(err);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type CreatePropertyReportApiOptions = GeneratePropertyReportOptions & {
  includeFactCard?: boolean;
  /** Skip L2 report snapshot reuse */
  bypassCache?: boolean;
};

export type CreatePropertyReportApiResult = {
  body: PropertyReportApiResponseBody;
  persisted: PersistedPropertyReport;
  generated: GeneratePropertyReportResult | null;
};

export async function createPropertyReportApi(
  address: string,
  options: CreatePropertyReportApiOptions = {},
): Promise<CreatePropertyReportApiResult> {
  const trimmed = address.trim();
  if (!trimmed || trimmed.length > 500) {
    throw new AiInputError("address_invalid");
  }

  const cacheKey = reportCacheKeyForAddress(trimmed);
  const includeFactCard = options.includeFactCard === true;

  if (!options.bypassCache && !includeFactCard) {
    const cached = await getLatestReportByCacheKey(cacheKey);
    if (cached) {
      await recordPropertyAudit({
        actor: "system",
        action: "generate",
        reportId: cached.reportId,
        country: cached.envelope.country,
        meta: { cacheHit: true },
      });
      return {
        body: toApiResponseBody(cached, {
          includeMarkdown: options.includeMarkdown,
          includeLegacyReport: options.includeLegacyReport,
          includeDomainReport: options.includeDomainReport,
          factCard: null,
        }),
        persisted: cached,
        generated: null,
      };
    }
  }

  const generated = await withTimeout(
    generatePropertyReport(trimmed, {
      bypassCache: options.bypassCache,
      includeMarkdown: options.includeMarkdown,
      includeLegacyReport: true,
      includeDomainReport: true,
      locale: options.locale,
      deps: options.deps,
    }),
    propertyReportTimeoutMs(),
  );

  const envelope = buildEnvelopeFromGenerateResult(generated, cacheKey);
  // Apply include flags on stored envelope for size control
  if (options.includeMarkdown === false) envelope.markdown = null;
  if (options.includeLegacyReport === false) envelope.report = null;
  if (options.includeDomainReport === false) envelope.domainReport = null;

  const persisted = await persistPropertyReport({
    address: trimmed,
    envelope: {
      ...envelope,
      // Always persist full report when available for GET evidence; re-generate if stripped
      report: generated.report,
      domainReport: generated.domainReport,
      markdown: options.includeMarkdown === false ? null : generated.markdown,
    },
    evidence: generated.report?.evidence,
  });

  await recordPropertyAudit({
    actor: "system",
    action: "generate",
    reportId: persisted.reportId,
    country: generated.stages.country,
    meta: { cacheHit: false, dataGapCount: generated.stages.dataGapCount },
  });

  return {
    body: toApiResponseBody(persisted, {
      includeMarkdown: options.includeMarkdown,
      includeLegacyReport: options.includeLegacyReport,
      includeDomainReport: options.includeDomainReport,
      factCard: includeFactCard ? generated.factCard : null,
    }),
    persisted,
    generated,
  };
}
