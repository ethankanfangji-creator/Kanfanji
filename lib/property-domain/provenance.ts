/**
 * Provenance wrapper — every important domain field carries source metadata.
 */

export const PROVENANCE_STATUSES = [
  "found",
  "not_found",
  "needs_human",
  "conflict",
  "expired",
] as const;
export type ProvenanceStatus = (typeof PROVENANCE_STATUSES)[number];

export type ProvenancedValue<T> = {
  value: T | null;
  unit: string | null;
  source: string | null;
  sourceUrl: string | null;
  retrievedAt: string | null;
  effectiveDate: string | null;
  confidence: number | null;
  evidenceIds: string[];
  limitations: string | null;
  status: ProvenanceStatus;
};

export function emptyProvenanced<T>(status: ProvenanceStatus = "not_found"): ProvenancedValue<T> {
  return {
    value: null,
    unit: null,
    source: null,
    sourceUrl: null,
    retrievedAt: null,
    effectiveDate: null,
    confidence: null,
    evidenceIds: [],
    limitations: null,
    status,
  };
}

export function foundProvenanced<T>(
  value: T,
  meta: Partial<Omit<ProvenancedValue<T>, "value" | "status">> & {
    evidenceIds?: string[];
  } = {},
): ProvenancedValue<T> {
  return {
    value,
    unit: meta.unit ?? null,
    source: meta.source ?? null,
    sourceUrl: meta.sourceUrl ?? null,
    retrievedAt: meta.retrievedAt ?? null,
    effectiveDate: meta.effectiveDate ?? null,
    confidence: meta.confidence ?? null,
    evidenceIds: meta.evidenceIds ?? [],
    limitations: meta.limitations ?? null,
    status: "found",
  };
}
