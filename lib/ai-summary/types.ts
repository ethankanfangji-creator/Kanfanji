/** Structured AI viewing summary — editable, source-linked, confidence-aware. */

export type ConfidenceLevel = "high" | "medium" | "low" | "needs_verification";

export type AiSourceKind = "transcript" | "marker" | "note" | "media";

export type AiSourceRef = {
  kind: AiSourceKind;
  /** Seconds into the recording when known. */
  timestampSec?: number | null;
  noteId?: number | null;
  mediaId?: string | null;
  /** Short supporting quote from transcript when available. */
  quote?: string | null;
};

export type AiClaimItem = {
  id: string;
  text: string;
  confidence: ConfidenceLevel;
  sources: AiSourceRef[];
  /** Soft-deleted by user; kept for undo / audit until purged. */
  deleted?: boolean;
};

export type ViewingAiSummary = {
  version: 1;
  transcript: string;
  mediaId?: string | null;
  noteId?: number | null;
  facts: AiClaimItem[];
  pros: AiClaimItem[];
  risks: AiClaimItem[];
  followUps: AiClaimItem[];
  actionItems: AiClaimItem[];
  generatedAt: string;
};

export type ProcessRecordingLegacyPayload = {
  transcript?: string;
  answers?: Array<{ id: number; status: "answered" | "pending"; answer: string }>;
  new_questions?: Array<{
    text: string;
    status: "answered" | "pending";
    answer: string;
    reason?: string;
    based_on?: string;
  }>;
  /** Legacy string arrays — still accepted & normalized. */
  pros?: string[] | AiClaimItem[];
  risks?: string[] | AiClaimItem[];
  facts?: AiClaimItem[] | string[];
  followUps?: AiClaimItem[] | string[];
  actionItems?: AiClaimItem[] | string[];
  summary?: Partial<ViewingAiSummary>;
  error?: string;
};

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T; warnings: ValidationIssue[] }
  | { ok: false; error: string; issues: ValidationIssue[] };
