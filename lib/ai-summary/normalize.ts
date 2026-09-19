import type {
  AiClaimItem,
  AiSourceRef,
  ConfidenceLevel,
  ProcessRecordingLegacyPayload,
  ValidationIssue,
  ValidationResult,
  ViewingAiSummary,
} from "./types";

const CONFIDENCE: readonly ConfidenceLevel[] = [
  "high",
  "medium",
  "low",
  "needs_verification",
] as const;

export function newClaimId(prefix = "c"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return typeof value === "string" && (CONFIDENCE as readonly string[]).includes(value);
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function normalizeSource(raw: unknown, issues: ValidationIssue[], path: string): AiSourceRef | null {
  if (!raw || typeof raw !== "object") {
    issues.push({ path, message: "source must be an object" });
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind;
  if (kind !== "transcript" && kind !== "marker" && kind !== "note" && kind !== "media") {
    issues.push({ path: `${path}.kind`, message: "invalid source kind" });
    return null;
  }
  return {
    kind,
    timestampSec:
      typeof obj.timestampSec === "number" && Number.isFinite(obj.timestampSec)
        ? obj.timestampSec
        : null,
    noteId: typeof obj.noteId === "number" ? obj.noteId : null,
    mediaId: typeof obj.mediaId === "string" ? obj.mediaId : null,
    quote: asTrimmedString(obj.quote),
  };
}

function claimFromString(
  text: string,
  defaults: { confidence?: ConfidenceLevel; mediaId?: string | null; noteId?: number | null },
): AiClaimItem {
  const sources: AiSourceRef[] = [];
  if (defaults.mediaId || defaults.noteId != null) {
    sources.push({
      kind: defaults.mediaId ? "media" : "note",
      mediaId: defaults.mediaId ?? null,
      noteId: defaults.noteId ?? null,
      timestampSec: null,
      quote: null,
    });
  }
  return {
    id: newClaimId("claim"),
    text,
    confidence: defaults.confidence ?? "needs_verification",
    sources,
  };
}

export function normalizeClaimItem(
  raw: unknown,
  issues: ValidationIssue[],
  path: string,
  defaults: { mediaId?: string | null; noteId?: number | null } = {},
): AiClaimItem | null {
  if (typeof raw === "string") {
    const text = asTrimmedString(raw);
    if (!text) return null;
    return claimFromString(text, {
      confidence: "needs_verification",
      ...defaults,
    });
  }
  if (!raw || typeof raw !== "object") {
    issues.push({ path, message: "claim must be string or object" });
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const text = asTrimmedString(obj.text);
  if (!text) {
    issues.push({ path: `${path}.text`, message: "missing text" });
    return null;
  }
  const confidence = isConfidenceLevel(obj.confidence)
    ? obj.confidence
    : "needs_verification";
  if (!isConfidenceLevel(obj.confidence)) {
    issues.push({
      path: `${path}.confidence`,
      message: "missing/invalid confidence → needs_verification",
    });
  }
  const sourcesRaw = Array.isArray(obj.sources) ? obj.sources : [];
  const sources = sourcesRaw
    .map((item, index) => normalizeSource(item, issues, `${path}.sources[${index}]`))
    .filter((item): item is AiSourceRef => Boolean(item));

  if (sources.length === 0 && (defaults.mediaId || defaults.noteId != null)) {
    sources.push({
      kind: defaults.mediaId ? "media" : "note",
      mediaId: defaults.mediaId ?? null,
      noteId: defaults.noteId ?? null,
      timestampSec: null,
      quote: null,
    });
  }

  return {
    id: asTrimmedString(obj.id) || newClaimId("claim"),
    text,
    confidence,
    sources,
    deleted: obj.deleted === true,
  };
}

function normalizeClaimList(
  raw: unknown,
  issues: ValidationIssue[],
  path: string,
  defaults: { mediaId?: string | null; noteId?: number | null },
  max = 12,
): AiClaimItem[] {
  if (!Array.isArray(raw)) {
    if (raw != null) issues.push({ path, message: "expected array" });
    return [];
  }
  return raw
    .slice(0, max)
    .map((item, index) => normalizeClaimItem(item, issues, `${path}[${index}]`, defaults))
    .filter((item): item is AiClaimItem => Boolean(item));
}

/**
 * Accepts the new structured shape, nested `summary`, or legacy string arrays.
 * Never throws — returns ok:false with friendly issues when unusable.
 */
export function validateAndNormalizeSummary(
  payload: ProcessRecordingLegacyPayload | Record<string, unknown> | null | undefined,
  options?: {
    mediaId?: string | null;
    noteId?: number | null;
    generatedAt?: string;
  },
): ValidationResult<ViewingAiSummary> {
  const issues: ValidationIssue[] = [];
  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      error: "AI 回傳為空或格式無法解析",
      issues: [{ path: "", message: "payload is not an object" }],
    };
  }

  const root = payload as ProcessRecordingLegacyPayload;
  const nested =
    root.summary && typeof root.summary === "object"
      ? (root.summary as ProcessRecordingLegacyPayload)
      : null;

  const transcript =
    asTrimmedString(root.transcript) ||
    asTrimmedString(nested?.transcript) ||
    "";

  const defaults = {
    mediaId: options?.mediaId ?? null,
    noteId: options?.noteId ?? null,
  };

  const facts = normalizeClaimList(
    nested?.facts ?? root.facts,
    issues,
    "facts",
    defaults,
  );
  const pros = normalizeClaimList(nested?.pros ?? root.pros, issues, "pros", defaults);
  const risks = normalizeClaimList(nested?.risks ?? root.risks, issues, "risks", defaults);
  const followUps = normalizeClaimList(
    nested?.followUps ??
      (root as { follow_ups?: unknown }).follow_ups ??
      root.followUps ??
      // Derive soft follow-ups from new_questions when structured list missing.
      (Array.isArray(root.new_questions)
        ? root.new_questions.map((q) => q.text)
        : undefined),
    issues,
    "followUps",
    defaults,
  );
  const actionItems = normalizeClaimList(
    nested?.actionItems ??
      (root as { action_items?: unknown }).action_items ??
      root.actionItems,
    issues,
    "actionItems",
    defaults,
  );

  const hasAny =
    facts.length + pros.length + risks.length + followUps.length + actionItems.length > 0;

  if (!transcript && !hasAny) {
    return {
      ok: false,
      error: "AI 回傳不完整：沒有逐字稿也沒有摘要項目",
      issues: issues.length
        ? issues
        : [{ path: "transcript", message: "empty transcript and empty claims" }],
    };
  }

  // Incomplete but salvageable → warnings, still ok.
  if (!Array.isArray(nested?.pros ?? root.pros) && pros.length === 0) {
    issues.push({ path: "pros", message: "missing pros (allowed empty)" });
  }
  if (!Array.isArray(nested?.risks ?? root.risks) && risks.length === 0) {
    issues.push({ path: "risks", message: "missing risks (allowed empty)" });
  }

  const value: ViewingAiSummary = {
    version: 1,
    transcript,
    mediaId: defaults.mediaId,
    noteId: defaults.noteId,
    facts,
    pros,
    risks,
    followUps,
    actionItems,
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
  };

  return { ok: true, value, warnings: issues };
}

export function activeClaims(items: AiClaimItem[]): AiClaimItem[] {
  return items.filter((item) => !item.deleted && item.text.trim().length > 0);
}

export function claimsToLegacyStrings(items: AiClaimItem[], max = 3): string[] {
  return activeClaims(items)
    .slice(0, max)
    .map((item) => item.text);
}

export function updateClaimText(
  summary: ViewingAiSummary,
  section: keyof Pick<
    ViewingAiSummary,
    "facts" | "pros" | "risks" | "followUps" | "actionItems"
  >,
  id: string,
  text: string,
): ViewingAiSummary {
  return {
    ...summary,
    [section]: summary[section].map((item) =>
      item.id === id ? { ...item, text: text.trim() } : item,
    ),
  };
}

export function softDeleteClaim(
  summary: ViewingAiSummary,
  section: keyof Pick<
    ViewingAiSummary,
    "facts" | "pros" | "risks" | "followUps" | "actionItems"
  >,
  id: string,
): ViewingAiSummary {
  return {
    ...summary,
    [section]: summary[section].map((item) =>
      item.id === id ? { ...item, deleted: true } : item,
    ),
  };
}

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("模型沒有回傳 JSON 物件");
  }
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}
