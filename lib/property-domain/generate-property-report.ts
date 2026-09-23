/**
 * End-to-end query flow:
 * normalize → geocode → country → providers → conflict → distances →
 * confidence/gaps → JSON (legacy + domain) → zh-Hant markdown
 */

import {
  assemblePropertyFacts,
  type AssemblePropertyFactsInput,
} from "@/lib/property-facts/orchestrator";
import { projectFactCardToReport } from "@/lib/property-facts/report";
import type { PropertyReport } from "@/lib/property-facts/report-types";
import type { PropertyFactCard, PropertyRegion } from "@/lib/property-facts/types";
import type { PropertyFactsPipelineDeps } from "@/lib/property-facts/interfaces";
import { safeToDomainPropertyReport } from "./adapt";
import type { DomainPropertyReport } from "./models";
import {
  markdownCitationErrors,
  renderPropertyReportMarkdown,
} from "./markdown-report";

export type GeneratePropertyReportOptions = {
  bypassCache?: boolean;
  /** Markdown is always zh-Hant in this phase; locale reserved for later. */
  locale?: "zh-Hant" | "zh-Hans" | "en" | "th";
  includeMarkdown?: boolean;
  includeLegacyReport?: boolean;
  includeDomainReport?: boolean;
  deps?: Partial<PropertyFactsPipelineDeps>;
};

export type GeneratePropertyReportStages = {
  normalized: boolean;
  geocoded: boolean;
  country: PropertyRegion;
  providersUsed: string[];
  providersSkipped: Array<{ id: string; reason: string }>;
  dataGapCount: number;
  domainValid: boolean;
};

export type GeneratePropertyReportResult = {
  address: string;
  normalizedQuery: string;
  factCard: PropertyFactCard;
  report: PropertyReport | null;
  domainReport: DomainPropertyReport | null;
  markdown: string | null;
  stages: GeneratePropertyReportStages;
};

/**
 * Public entry: address → structured JSON + Traditional Chinese markdown.
 */
export async function generatePropertyReport(
  address: string,
  options: GeneratePropertyReportOptions = {},
): Promise<GeneratePropertyReportResult> {
  const includeMarkdown = options.includeMarkdown !== false;
  const includeLegacy = options.includeLegacyReport !== false;
  const includeDomain = options.includeDomainReport !== false;

  const assembleInput: AssemblePropertyFactsInput = {
    address,
    bypassCache: options.bypassCache,
    deps: options.deps,
  };

  const factCard = await assemblePropertyFacts(assembleInput);
  const normalizedQuery =
    (factCard.identity.normalizedAddress.status === "found" &&
      factCard.identity.normalizedAddress.value) ||
    factCard.identity.rawAddress ||
    address.trim();

  const report = includeLegacy || includeMarkdown || includeDomain
    ? projectFactCardToReport(factCard)
    : null;

  let domainReport: DomainPropertyReport | null = null;
  let domainValid = false;
  if (includeDomain || includeMarkdown) {
    const domain = safeToDomainPropertyReport(factCard);
    domainValid = domain.ok;
    domainReport = domain.ok ? domain.report : null;
  }

  let markdown: string | null = null;
  if (includeMarkdown && report) {
    markdown = renderPropertyReportMarkdown({
      legacy: report,
      domain: domainReport,
    });
    const bad = markdownCitationErrors(
      markdown,
      report.evidence.map((e) => e.id),
    );
    if (bad.length) {
      // Strip should already have run in narrative; drop unknown markers defensively
      for (const id of bad) {
        markdown = markdown.replaceAll(`\`${id}\``, "").replaceAll(id, "");
      }
    }
  }

  const stages: GeneratePropertyReportStages = {
    normalized: Boolean(normalizedQuery),
    geocoded: factCard.meta.geocodeOk,
    country: factCard.region,
    providersUsed: (factCard.meta.providersUsed ?? []).map((p) => p.id),
    providersSkipped: (factCard.meta.providersSkipped ?? []).map((p) => ({
      id: p.id,
      reason: p.reason,
    })),
    dataGapCount:
      domainReport?.dataGaps.length ?? report?.risks.data_gaps.length ?? 0,
    domainValid,
  };

  return {
    address: factCard.identity.rawAddress || address.trim(),
    normalizedQuery,
    factCard,
    report: includeLegacy ? report : null,
    domainReport: includeDomain ? domainReport : null,
    markdown,
    stages,
  };
}
