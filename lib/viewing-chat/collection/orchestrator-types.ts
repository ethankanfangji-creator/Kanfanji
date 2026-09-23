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

export type ConversationState = {
  status: ConversationStatus;
  record: PropertyRecord;
  evidence: FieldEvidence[];
  address?: string | null;
  locale?: string;
  /** Soft focus for skip UX — not the sole source of truth */
  focusFieldIds?: PropertyFieldId[];
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
  question: string;
  priority: number;
  skippable: true;
};

export type RecordChange = {
  fieldId: PropertyFieldId;
  kind: "added" | "updated" | "corrected" | "conflict" | "skipped" | "unknown";
  previousValue?: string | number | boolean | null;
  nextValue?: string | number | boolean | null;
  rawText?: string;
};

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
   * On failure, return `{ text: draft, warning: "llm_failed" | "llm_schema_invalid" }`.
   */
  polishReply?: (
    draft: string,
    userText: string,
  ) => Promise<{ text: string; warning?: string }>;
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
};

export type FieldSnapshot = PropertyFieldState;
