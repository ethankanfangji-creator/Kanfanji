import { scoreConfidence } from "./confidence";
import type {
  ConfidenceLevel,
  Evidence,
  FieldStatus,
  LaneId,
  MatchLevel,
  ProvenancedField,
  SourceClass,
  SourceType,
} from "./types";
import { defaultSourceType, sourceClassOf } from "./types";
import { compareEvidence } from "./conflict-policy";

const DEFAULT_TTL_HOURS: Record<string, number> = {
  identity: 168,
  listing: 72,
  parcel: 168,
  building: 168,
  hoa: 72,
  zoning: 168,
  poi: 336,
  transit: 336,
  risk: 168,
  market: 48,
  public_web: 24,
};

export function ttlHoursForLane(lane: LaneId | "identity" | "public_web"): number {
  return DEFAULT_TTL_HOURS[lane] ?? 168;
}

export function expiresAtFrom(fetchedAt: string, hours: number): string {
  const t = new Date(fetchedAt).getTime();
  const base = Number.isFinite(t) ? t : Date.now();
  return new Date(base + hours * 3600_000).toISOString();
}

export function makeEvidence<T>(input: {
  lane: LaneId;
  field: string;
  value: T;
  sourceClass?: SourceClass;
  sourceType?: SourceType;
  sourceId: string;
  sourceLabel: string;
  fetchedAt: string;
  ttlHours?: number;
  confidenceHint?: ConfidenceLevel;
  rawRef?: string;
  unit?: string | null;
  sourceUrl?: string | null;
  effectiveDate?: string | null;
  matchLevel?: MatchLevel;
  evidence?: string | null;
  limitations?: string | null;
}): Evidence<T> {
  const ttl = input.ttlHours ?? ttlHoursForLane(input.lane);
  const sourceType = input.sourceType ?? defaultSourceType(input.sourceClass ?? "public_web");
  const sourceClass = sourceClassOf(sourceType);
  const matchLevel = input.matchLevel ?? "street";
  const retrievedAt = input.fetchedAt;
  return {
    lane: input.lane,
    field: input.field,
    value: input.value,
    unit: input.unit ?? null,
    sourceType,
    sourceClass,
    sourceId: input.sourceId,
    sourceName: input.sourceLabel,
    sourceLabel: input.sourceLabel,
    sourceUrl: input.sourceUrl ?? input.rawRef ?? null,
    retrievedAt,
    fetchedAt: retrievedAt,
    effectiveDate: input.effectiveDate ?? null,
    expiresAt: expiresAtFrom(retrievedAt, ttl),
    matchLevel,
    confidence: scoreConfidence({
      sourceType,
      matchLevel,
      retrievedAt,
      effectiveDate: input.effectiveDate,
    }),
    evidence: input.evidence ?? null,
    limitations: input.limitations ?? null,
    confidenceHint: input.confidenceHint,
    rawRef: input.rawRef,
  };
}

function blankField<T>(status: FieldStatus): ProvenancedField<T> {
  return {
    status,
    value: null,
    unit: null,
    sourceType: null,
    sourceClass: null,
    sourceId: null,
    sourceName: null,
    sourceLabel: null,
    sourceUrl: null,
    retrievedAt: null,
    fetchedAt: null,
    effectiveDate: null,
    expiresAt: null,
    matchLevel: null,
    confidence: null,
    evidence: null,
    limitations: null,
  };
}

export function notFoundField<T>(): ProvenancedField<T> {
  return blankField("not_found");
}

export function needsHumanField<T>(opts?: {
  rawRef?: string | null;
  sourceLabel?: string | null;
  value?: T | null;
  sourceType?: SourceType | null;
  confidence?: number | null;
  limitations?: string | null;
  evidence?: string | null;
  unit?: string | null;
  matchLevel?: MatchLevel | null;
  sourceUrl?: string | null;
  retrievedAt?: string | null;
  effectiveDate?: string | null;
  estimated?: boolean;
  conflicts?: Evidence<T>[];
}): ProvenancedField<T> {
  return {
    ...blankField<T>("needs_human"),
    value: opts?.value ?? null,
    unit: opts?.unit ?? null,
    sourceType: opts?.sourceType ?? "listing_claim",
    sourceClass: opts?.sourceType ? sourceClassOf(opts.sourceType) : "public_web",
    sourceName: opts?.sourceLabel ?? null,
    sourceLabel: opts?.sourceLabel ?? null,
    sourceUrl: opts?.sourceUrl ?? opts?.rawRef ?? null,
    retrievedAt: opts?.retrievedAt ?? null,
    fetchedAt: opts?.retrievedAt ?? null,
    effectiveDate: opts?.effectiveDate ?? null,
    matchLevel: opts?.matchLevel ?? null,
    confidence: opts?.confidence ?? null,
    evidence: opts?.evidence ?? null,
    limitations: opts?.limitations ?? null,
    estimated: opts?.estimated,
    conflicts: opts?.conflicts,
    rawRef: opts?.rawRef ?? null,
  };
}

/** Unresolved multi-source conflict — no single confirmed value. */
export function conflictField<T>(opts: {
  candidates: Evidence<T>[];
  confidence?: number | null;
  limitations?: string | null;
}): ProvenancedField<T> {
  const first = opts.candidates[0];
  return {
    ...blankField<T>("conflict"),
    value: null,
    unit: first?.unit ?? null,
    sourceType: first?.sourceType ?? null,
    sourceClass: first?.sourceClass ?? null,
    sourceId: first?.sourceId ?? null,
    sourceName: first?.sourceName ?? first?.sourceLabel ?? null,
    sourceLabel: first?.sourceLabel ?? null,
    sourceUrl: first?.sourceUrl ?? null,
    retrievedAt: first?.retrievedAt ?? null,
    fetchedAt: first?.fetchedAt ?? null,
    effectiveDate: first?.effectiveDate ?? null,
    matchLevel: first?.matchLevel ?? null,
    confidence: opts.confidence ?? null,
    evidence: null,
    limitations:
      opts.limitations ??
      "Multiple equally ranked sources disagree; both retained as conflict — no automatic pick.",
    estimated: false,
    conflicts: opts.candidates,
  };
}

export function foundField<T>(
  value: T,
  meta: {
    sourceClass: SourceClass;
    sourceType: SourceType;
    sourceId: string;
    sourceLabel: string;
    fetchedAt: string;
    expiresAt: string;
    confidence: number;
    unit?: string | null;
    sourceUrl?: string | null;
    effectiveDate?: string | null;
    matchLevel?: MatchLevel | null;
    evidence?: string | null;
    limitations?: string | null;
    conflicts?: Evidence<T>[];
    rawRef?: string | null;
    estimated?: boolean;
  },
): ProvenancedField<T> {
  return {
    status: "found",
    value,
    unit: meta.unit ?? null,
    sourceType: meta.sourceType,
    sourceClass: meta.sourceClass,
    sourceId: meta.sourceId,
    sourceName: meta.sourceLabel,
    sourceLabel: meta.sourceLabel,
    sourceUrl: meta.sourceUrl ?? meta.rawRef ?? null,
    retrievedAt: meta.fetchedAt,
    fetchedAt: meta.fetchedAt,
    effectiveDate: meta.effectiveDate ?? null,
    expiresAt: meta.expiresAt,
    matchLevel: meta.matchLevel ?? null,
    confidence: meta.confidence,
    evidence: meta.evidence ?? null,
    limitations: meta.limitations ?? null,
    estimated: meta.estimated ?? false,
    conflicts: meta.conflicts,
    rawRef: meta.rawRef ?? null,
  };
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === "number" && typeof b === "number") {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a) === String(b);
}

export function rankEvidence(a: Evidence<unknown>, b: Evidence<unknown>): number {
  return compareEvidence(a, b);
}

export function isExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t <= now;
}

export function fieldStatusFromEvidence(
  evidence: Evidence<unknown>[],
  now = Date.now(),
): FieldStatus {
  if (evidence.length === 0) return "not_found";
  const live = evidence.filter((e) => !isExpired(e.expiresAt, now));
  if (live.length === 0) return "expired";
  return "found";
}
