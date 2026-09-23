/**
 * Conversation orchestrator public types for processUserTurn.
 */

import type {
  CaptureInput,
  PropertyCollectionRecord,
  PropertyFactEvidence,
  PropertyFieldId,
  PropertyFieldState,
} from "./types";

export type ConversationStatus = "collecting" | "reviewing" | "completed";

export type TurnIntent =
  | "supplement"
  | "correct"
  | "skip"
  | "finish"
  | "question"
  | "upload_related"
  | "general";

/** Alias — structured house data at a point in time */
export type PropertyRecord = PropertyCollectionRecord & {
  skippedFields: PropertyFieldId[];
  captures: StoredCapture[];
};

/** Alias — field-level evidence / correction / conflict rows */
export type FieldEvidence = PropertyFactEvidence;

export type StoredCapture = CaptureInput & {
  id: string;
  createdAt: string;
  /** True when media arrived but vision/OCR has not finished */
  pendingVision?: boolean;
  /** True when speech transcript looks truncated / failed */
  transcriptIncomplete?: boolean;
};

export type PendingConfirmState = {
  fieldId: PropertyFieldId;
  candidateValue: string;
  source: "vision" | "intel" | "assistant_guess" | "inferred";
};

export type ConversationState = {
  status: ConversationStatus;
  record: PropertyRecord;
  evidence: FieldEvidence[];
  address?: string | null;
  locale?: string;
  /** Soft focus for skip UX — not the sole source of truth */
  focusFieldIds?: PropertyFieldId[];
  /** 招1 — candidate awaiting yes/no */
  pendingConfirm?: PendingConfirmState | null;
  /** 招4 — completed user turns before this one (0-based count of prior user msgs) */
  userTurnCount?: number;
};

export type UserTurnMessage = {
  id: string;
  text?: string;
  /** Speech-to-text result */
  transcript?: string;
  /** Whisper cut off / empty / too short */
  transcriptIncomplete?: boolean;
  /** Prefer UI locale hints; reply language still follows user text */
  locale?: string;
};

export type SuggestedQuestion = {
  fieldId: PropertyFieldId;
  /** 招2 — multiple fields covered by one composite question */
  fieldIds?: PropertyFieldId[];
  question: string;
  priority: number;
  skippable: true;
  /** 招1 confirm / 招3 clarify / 招2 composite / open */
  kind?: "open" | "confirm" | "clarify" | "composite";
  /** 招1 — candidate value awaiting yes/no */
  candidateValue?: string;
};

export type RecordChange = {
  fieldId: PropertyFieldId;
  kind: "added" | "updated" | "corrected" | "conflict" | "skipped" | "unknown";
  previousValue?: string | number | boolean | null;
  nextValue?: string | number | boolean | null;
  rawText?: string;
};

/** ok = usable; extraction_failed = Zod/LLM failed — keep prior facts + raw response */
export type ExtractionStatus = "ok" | "extraction_failed";

export type ProcessUserTurnInput = {
  conversation: ConversationState;
  message: UserTurnMessage;
  captures?: CaptureInput[];
  /**
   * Optional OpenAI key — when present, may polish reply language.
   * Failures must never drop captures / facts already merged.
   */
  apiKey?: string;
  signal?: AbortSignal;
  /**
   * Optional polish override (tests / custom providers).
   * On failure, return `{ text: draft, warning: "llm_failed" | "extraction_failed", extractionStatus }`.
   * Never invent facts; caller keeps prior record on schema failure.
   */
  polishReply?: (
    draft: string,
    userText: string,
  ) => Promise<{
    text: string;
    warning?: string;
    extractionStatus?: ExtractionStatus;
    rawAiResponse?: string;
  }>;
};

export type ProcessUserTurnResult = {
  assistantMessage: string;
  updatedRecord: PropertyRecord;
  updatedEvidence: FieldEvidence[];
  suggestedQuestions: SuggestedQuestion[];
  changes: RecordChange[];
  conversationStatus: ConversationStatus;
  /** Classified intent for this turn */
  intent: TurnIntent;
  /** Guard / soft-fail notes for logging / UI */
  warnings: string[];
  /** Raw user message was retained even if downstream AI failed */
  preservedMessageId: string;
  extractionStatus: ExtractionStatus;
  /** Raw model output when schema validation failed (for debug / retry) */
  rawAiResponse?: string;
  /** Soft focus for next Explicit (A) short-answer fill */
  focusFieldIds: PropertyFieldId[];
  /** 招1 — next Yes/No candidate (or null if cleared) */
  pendingConfirm: PendingConfirmState | null;
};

export type FieldSnapshot = PropertyFieldState;
