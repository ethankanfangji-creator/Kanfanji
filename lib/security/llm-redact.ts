/**
 * Minimize / redact PropertyReport before sending to an LLM.
 * Full ownership / deed / tax identity payloads are excluded by default.
 */

import type { PropertyReport, ReportEvidenceItem } from "@/lib/property-facts/report-types";
import {
  fenceUntrusted,
  renderUntrustedFence,
  UNTRUSTED_DATA_SYSTEM_RULE,
} from "./untrusted-content";

/** Field paths / evidence fields that must not go to the LLM by default. */
const SENSITIVE_FIELD_RE =
  /owner|deed|title_holder|occupant|ssn|passport|tax_id|national_id|phone|email|dob|birth/i;

export type LlmPropertyPayloadOptions = {
  /** When true + caller asserts legal basis, include raw evidence strings (still sanitized). */
  includeRawEvidence?: boolean;
  maxEvidence?: number;
  maxSnippetChars?: number;
};

export type LlmPropertyPayload = {
  redacted: true;
  address: string;
  country: string | null;
  evidence: Array<{
    id: string;
    field: string;
    value: unknown;
    source_type: string | null;
    confidence: number | null;
    status: string;
  }>;
  data_gaps: string[];
  narrative_summary_zh: string | null;
  /** Fenced untrusted public_web snippets only */
  untrusted_blocks: string[];
  disclaimer: string;
};

function isSensitiveEvidence(ev: ReportEvidenceItem): boolean {
  return SENSITIVE_FIELD_RE.test(ev.field) || SENSITIVE_FIELD_RE.test(String(ev.value ?? ""));
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.slice(0, 240);
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 5).map(scrubValue);
  }
  return "[omitted]";
}

/**
 * Build a compact, citation-safe property payload for chat / report LLMs.
 */
export function buildLlmPropertyPayload(
  report: PropertyReport,
  opts: LlmPropertyPayloadOptions = {},
): LlmPropertyPayload {
  const maxEvidence = opts.maxEvidence ?? 40;
  const includeRaw = opts.includeRawEvidence === true;
  const untrusted_blocks: string[] = [];

  const evidence = report.evidence
    .filter((ev) => !isSensitiveEvidence(ev))
    .slice(0, maxEvidence)
    .map((ev) => {
      if (ev.source_type === "public_web" || ev.field === "public_web_snippet") {
        const raw =
          (typeof ev.evidence === "string" && ev.evidence) ||
          (typeof ev.value === "string" ? ev.value : "");
        if (raw) {
          const blob = fenceUntrusted(raw, {
            kind: "html",
            sourceUrl: ev.source_url,
            licenseHint: "search_api",
            retrievedAt: ev.retrieved_at ?? undefined,
            maxChars: opts.maxSnippetChars ?? 500,
          });
          // Re-tag kind for fence metadata as web_snippet
          blob.kind = "web_snippet";
          untrusted_blocks.push(renderUntrustedFence(blob));
        }
      }
      return {
        id: ev.id,
        field: ev.field,
        value: scrubValue(ev.value),
        source_type: ev.source_type,
        confidence: ev.confidence,
        status: ev.status,
        ...(includeRaw && typeof ev.evidence === "string"
          ? { evidence_excerpt: ev.evidence.slice(0, 200) }
          : {}),
      };
    });

  return {
    redacted: true,
    address: report.request.normalized_address || report.request.input_address,
    country: report.request.country,
    evidence,
    data_gaps: report.risks.data_gaps.slice(0, 40),
    narrative_summary_zh: report.narrative?.summary_zh?.slice(0, 800) ?? null,
    untrusted_blocks: untrusted_blocks.slice(0, 8),
    disclaimer: report.disclaimer,
  };
}

export function llmPropertySystemRules(): string {
  return [
    UNTRUSTED_DATA_SYSTEM_RULE,
    "PROPERTY_EVIDENCE is a redacted structured summary — cite evidence ids only; never invent facts.",
    "Do not request or invent owner identity, deed, or full cadastre abstracts.",
  ].join(" ");
}

export { SENSITIVE_FIELD_RE };
