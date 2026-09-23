/**
 * Progressive property-fact collection — types for extract / merge / next-questions.
 * Field values represent data state, not a fixed questionnaire cursor.
 */

export const PROPERTY_FACT_STATUSES = [
  "confirmed",
  "inferred",
  "unknown",
  "corrected",
] as const;

export type PropertyFactStatus = (typeof PROPERTY_FACT_STATUSES)[number];

/** Stable field ids used by extract / merge / question ranking. */
export type PropertyFieldId =
  | "address"
  | "price"
  | "area"
  | "layout"
  | "floor"
  | "noise"
  | "transit"
  | "pros"
  | "cons"
  | "odor"
  | "light"
  | "water_damage"
  | "electrical"
  | "plumbing"
  | "hvac"
  | "parking"
  | "amenities"
  | (string & {});

export type CaptureKind = "text" | "transcript" | "photo" | "video" | "file";

/**
 * Multimodal capture unit. Text/transcript drive extraction today;
 * photo/video/file are accepted for future vision / media pipelines.
 */
export type CaptureInput = {
  kind: CaptureKind;
  /** User-authored or transcribed text when available */
  text?: string;
  messageId?: string;
  /**
   * Untrusted model observations (e.g. vision). May only yield `inferred` facts.
   * Never invent numeric listing facts from this alone.
   */
  analysis?: string;
  mediaRef?: string;
  /** Structured vision slot candidates — always merged as inferred */
  visionSlots?: Array<{
    fieldId: string;
    value: string;
    confidence?: number;
    note?: string;
  }>;
};

export type ExtractPropertyFactsInput = {
  /** Primary text for this turn (composer box) */
  text?: string;
  /** Whisper / speech transcript */
  transcript?: string;
  /** Message id of the user turn that produced this input */
  messageId?: string;
  /** Extensible multimodal payloads */
  captures?: CaptureInput[];
  locale?: string;
  /** Explicit (A): soft question focus for short-answer attribution */
  focusFieldIds?: PropertyFieldId[];
};

export type ExtractedPropertyFact = {
  fieldId: PropertyFieldId;
  value: string | number | boolean | null;
  status: PropertyFactStatus;
  /** 0–1; inferred typically lower than confirmed */
  confidence: number;
  sourceMessageId: string | null;
  /** Exact user / capture span that justified the value — never a paraphrased guess */
  rawText: string;
};

export type ConversationIntent =
  | "provide_info"
  | "correct"
  | "defer_skip"
  | "unknown"
  | "request_summary"
  | "ask_question"
  | "other";

export type ExtractPropertyFactsResult = {
  fields: ExtractedPropertyFact[];
  intent: ConversationIntent;
  /** Concatenated trusted user text used for extraction */
  sourceText: string;
  /** Fields the user explicitly asked to skip / defer this turn */
  skippedFieldIds: PropertyFieldId[];
};

export type EvidenceKind =
  | "statement"
  | "inference"
  | "correction"
  | "conflict"
  | "unknown"
  | "defer";

export type PropertyFactEvidence = {
  id: string;
  fieldId: PropertyFieldId;
  kind: EvidenceKind;
  value: string | number | boolean | null;
  status: PropertyFactStatus;
  confidence: number;
  sourceMessageId: string | null;
  rawText: string;
  createdAt: string;
  /** Set on conflict / correction rows */
  previousValue?: string | number | boolean | null;
  incomingValue?: string | number | boolean | null;
  note?: string;
};

export type PropertyFieldState = {
  fieldId: PropertyFieldId;
  value: string | number | boolean | null;
  status: PropertyFactStatus;
  confidence: number;
  sourceMessageId: string | null;
  rawText: string;
  updatedAt: string;
  /** True when an unresolved conflict exists for this field */
  hasConflict?: boolean;
};

export type ConversationMode = "collecting" | "confirming" | "reporting";

export type PropertyCollectionRecord = {
  address?: string | null;
  mode: ConversationMode;
  fields: Partial<Record<PropertyFieldId, PropertyFieldState>>;
  updatedAt: string;
};

export type MergePropertyFactsResult = {
  record: PropertyCollectionRecord;
  evidence: PropertyFactEvidence[];
  /** Newly created conflict / correction evidence from this merge */
  conflicts: PropertyFactEvidence[];
};

export type NextQuestion = {
  fieldId: PropertyFieldId;
  question: string;
  priority: number;
  skippable: true;
};

export type GetNextQuestionsInput = {
  record: PropertyCollectionRecord;
  evidence: PropertyFactEvidence[];
  skippedFields: PropertyFieldId[];
  /** Optional market / locale for question copy */
  locale?: string;
};
