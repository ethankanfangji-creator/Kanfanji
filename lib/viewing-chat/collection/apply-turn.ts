import { extractPropertyFacts } from "./extract-property-facts";
import { getNextQuestions } from "./get-next-questions";
import {
  createEmptyPropertyRecord,
  mergePropertyFacts,
} from "./merge-property-facts";
import { agendaIdToFieldId, fieldIdToMatchedId } from "./field-map";
import type {
  ConversationIntent,
  ExtractedPropertyFact,
  NextQuestion,
  PropertyCollectionRecord,
  PropertyFactEvidence,
  PropertyFieldId,
} from "./types";

export type CollectionTurnInput = {
  text?: string;
  transcript?: string;
  messageId: string;
  photoAnalysis?: string;
  hasPhoto?: boolean;
  locale?: string;
  record: PropertyCollectionRecord | null | undefined;
  evidence: PropertyFactEvidence[] | null | undefined;
  skippedFields: PropertyFieldId[];
};

export type CollectionTurnResult = {
  record: PropertyCollectionRecord;
  evidence: PropertyFactEvidence[];
  conflicts: PropertyFactEvidence[];
  intent: ConversationIntent;
  extracted: ExtractedPropertyFact[];
  skippedFields: PropertyFieldId[];
  nextQuestions: NextQuestion[];
  /** Legacy matched[] for question-bank projection */
  matched: Array<{ id: string; answer: string }>;
  /** Visible coach reply (ack + up to 3 follow-ups) */
  replyText: string;
  /** Compat: first focus field mapped to agenda-ish id */
  focusMatchedId: string | null;
};

function formatValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && value >= 10_000) {
    // Prefer 萬 display for TWD-scale prices
    if (value % 10_000 === 0) return `${value / 10_000}萬`;
  }
  return String(value);
}

function buildAck(extracted: ExtractedPropertyFact[], intent: ConversationIntent): string {
  if (intent === "request_summary") {
    return "好，先幫你整理目前已記錄的內容。若要產出給家人的摘要卡，請點「產生報告」。";
  }

  const noted = extracted.filter(
    (f) =>
      f.status !== "unknown" &&
      f.value !== null &&
      f.value !== "" &&
      (f.status === "confirmed" || f.status === "corrected" || f.status === "inferred"),
  );

  if (intent === "correct" && noted.length) {
    const bits = noted.map((f) => `${f.fieldId}→${formatValue(f.value)}`);
    return `已更正：${bits.join("、")}。`;
  }

  if (intent === "defer_skip") {
    return "好，這項先跳過，之後再補也沒問題。";
  }

  if (noted.length) {
    const bits = noted
      .slice(0, 6)
      .map((f) => {
        if (f.fieldId === "noise" || f.fieldId === "pros" || f.fieldId === "cons") {
          return formatValue(f.value) || f.rawText;
        }
        return formatValue(f.value) || f.rawText;
      })
      .filter(Boolean);
    return bits.length ? `幫你記到：${bits.join("、")}。` : "已收到。";
  }

  if (extracted.some((f) => f.status === "unknown")) {
    return "好，先標成未知／之後再補。";
  }

  return "已收到，可以再說一段現場觀察。";
}

function buildReplyText(
  ack: string,
  questions: NextQuestion[],
  intent: ConversationIntent,
): string {
  if (intent === "request_summary" || questions.length === 0) {
    return ack;
  }
  const lines = questions.map((q, i) => `${i + 1}. ${q.question}`);
  return `${ack}\n\n還想跟你確認：\n${lines.join("\n")}`;
}

/**
 * Authoritative collection turn: extract → merge → next questions (max 3).
 * Does not call the LLM; integrateChatTurn may polish the ack separately.
 */
export function applyCollectionTurn(input: CollectionTurnInput): CollectionTurnResult {
  const baseRecord =
    input.record ??
    createEmptyPropertyRecord({
      mode: "collecting",
    });

  const priorEvidence = input.evidence ?? [];
  const skipped = [...new Set(input.skippedFields.map(String))] as PropertyFieldId[];

  const extracted = extractPropertyFacts({
    text: input.text,
    transcript: input.transcript,
    messageId: input.messageId,
    locale: input.locale,
    captures:
      input.hasPhoto || input.photoAnalysis
        ? [
            {
              kind: "photo",
              messageId: input.messageId,
              analysis: input.photoAnalysis,
            },
          ]
        : undefined,
  });

  const nextSkipped = [
    ...new Set([...skipped, ...extracted.skippedFieldIds]),
  ] as PropertyFieldId[];

  let mode = baseRecord.mode;
  if (extracted.intent === "request_summary") {
    mode = "confirming";
  } else if (mode === "confirming" && extracted.intent === "provide_info") {
    // User kept talking after wrap-up — resume collecting
    mode = "collecting";
  }

  const merged = mergePropertyFacts(baseRecord, extracted.fields, {
    evidence: priorEvidence,
    mode,
  });

  const nextQuestions =
    merged.record.mode === "confirming" || merged.record.mode === "reporting"
      ? []
      : getNextQuestions(merged.record, merged.evidence, nextSkipped, input.locale);

  const matched = extracted.fields
    .filter((f) => f.status !== "unknown" && f.value !== null && f.value !== "")
    .map((f) => ({
      id: fieldIdToMatchedId(f.fieldId),
      answer: formatValue(f.value) || f.rawText,
    }));

  const ack = buildAck(extracted.fields, extracted.intent);
  const replyText = buildReplyText(ack, nextQuestions, extracted.intent);

  const focusFieldId = nextQuestions[0]?.fieldId ?? null;
  const focusMatchedId = focusFieldId ? fieldIdToMatchedId(focusFieldId) : null;

  return {
    record: merged.record,
    evidence: merged.evidence,
    conflicts: merged.conflicts,
    intent: extracted.intent,
    extracted: extracted.fields,
    skippedFields: nextSkipped,
    nextQuestions,
    matched,
    replyText,
    focusMatchedId,
  };
}

/** Client-side skip of current focus / agenda item without a server round-trip. */
export function applyCollectionSkip(input: {
  record: PropertyCollectionRecord;
  evidence: PropertyFactEvidence[];
  skippedFields: PropertyFieldId[];
  /** Active agenda id or collection field id */
  skipId: string;
  locale?: string;
}): {
  record: PropertyCollectionRecord;
  evidence: PropertyFactEvidence[];
  skippedFields: PropertyFieldId[];
  nextQuestions: NextQuestion[];
  replyText: string;
  focusMatchedId: string | null;
} {
  const fieldId = agendaIdToFieldId(input.skipId);
  const skippedFields = [
    ...new Set([...input.skippedFields, fieldId]),
  ] as PropertyFieldId[];

  const nextQuestions = getNextQuestions(
    input.record,
    input.evidence,
    skippedFields,
    input.locale,
  );

  const ack = "好，這項先跳過。";
  const replyText =
    nextQuestions.length === 0
      ? `${ack}目前沒有更急的追問了，也可以直接產生報告。`
      : `${ack}\n\n還想跟你確認：\n${nextQuestions
          .map((q, i) => `${i + 1}. ${q.question}`)
          .join("\n")}`;

  return {
    record: input.record,
    evidence: input.evidence,
    skippedFields,
    nextQuestions,
    replyText,
    focusMatchedId: nextQuestions[0]
      ? fieldIdToMatchedId(nextQuestions[0].fieldId)
      : null,
  };
}
