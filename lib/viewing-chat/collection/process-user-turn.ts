import OpenAI from "openai";
import { classifyTurnIntent } from "./classify-turn-intent";
import { composeAssistantMessage } from "./compose-assistant-message";
import {
  isVagueUtterance,
  pickPendingConfirmFromRecord,
  resolvePendingConfirm,
  vagueFocusFact,
} from "./dialogue-strategy";
import { extractPropertyFacts } from "./extract-property-facts";
import { getNextQuestions } from "./get-next-questions";
import {
  extractPropertyFactsWithLlm,
  mergeRuleAndLlmFacts,
} from "./llm-extract";
import {
  viewingRecorderPolishRules,
  viewingRecorderSystemPrompt,
} from "./llm-prompt";
import { parseLlmJson, PolishReplySchema } from "./llm-schemas";
import { markAnswered, markAsked, stripInternalKeys } from "@/lib/viewing-chat/question-state";
import { createEmptyPropertyRecord, mergePropertyFacts } from "./merge-property-facts";
import type {
  ConversationState,
  ConversationStatus,
  ExtractionStatus,
  FieldEvidence,
  PendingConfirmState,
  ProcessUserTurnInput,
  ProcessUserTurnResult,
  PropertyRecord,
  RecordChange,
  StoredCapture,
  SuggestedQuestion,
  TurnIntent,
} from "./orchestrator-types";
import type { CaptureInput, ExtractedPropertyFact, PropertyFieldId } from "./types";

function captureId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `cap_${crypto.randomUUID()}`;
  }
  return `cap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toPropertyRecord(
  conversation: ConversationState,
): PropertyRecord {
  const base =
    conversation.record ??
    ({
      ...createEmptyPropertyRecord({
        address: conversation.address ?? null,
        mode: "collecting",
      }),
      skippedFields: [],
      captures: [],
    } as PropertyRecord);

  return {
    ...base,
    fields: { ...base.fields },
    skippedFields: [...(base.skippedFields ?? [])],
    captures: [...(base.captures ?? [])],
  };
}

/** Join text parts without repeating the same utterance (captures echo message.text). */
function uniqueJoinedText(parts: Array<string | undefined | null>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const t = part?.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.join("\n").trim();
}

function normalizeCaptures(
  messageId: string,
  captures: CaptureInput[] | undefined,
  message: ProcessUserTurnInput["message"],
): StoredCapture[] {
  const now = new Date().toISOString();
  const list = [...(captures ?? [])];

  if (message.text?.trim()) {
    list.push({
      kind: "text",
      text: message.text.trim(),
      messageId,
    });
  }
  if (message.transcript?.trim()) {
    list.push({
      kind: "transcript",
      text: message.transcript.trim(),
      messageId,
    });
  }

  return list.map((c) => {
    const pendingVision =
      (c.kind === "photo" || c.kind === "video") && !c.analysis?.trim();
    const transcriptIncomplete =
      Boolean(message.transcriptIncomplete) ||
      (c.kind === "transcript" &&
        (!c.text?.trim() ||
          /\[?(inaudible|unintelligible|…|\.\.\.)\]?$/i.test(c.text.trim()) ||
          c.text.trim().length < 3));

    return {
      ...c,
      id: captureId(),
      createdAt: now,
      messageId: c.messageId ?? messageId,
      pendingVision,
      transcriptIncomplete,
    };
  });
}

function deriveStatus(
  intent: TurnIntent,
  prev: ConversationStatus,
): ConversationStatus {
  if (intent === "finish") return "reviewing";
  if (prev === "completed") return "completed";
  if (prev === "reviewing" && (intent === "supplement" || intent === "correct")) {
    return "collecting";
  }
  return prev === "reviewing" ? "reviewing" : "collecting";
}

function buildChanges(input: {
  before: PropertyRecord;
  after: PropertyRecord;
  extracted: ExtractedPropertyFact[];
  conflicts: FieldEvidence[];
  skippedThisTurn: PropertyFieldId[];
}): RecordChange[] {
  const changes: RecordChange[] = [];
  const seen = new Set<string>();

  for (const fact of input.extracted) {
    const prev = input.before.fields[fact.fieldId];
    const next = input.after.fields[fact.fieldId];
    const conflict = input.conflicts.find((c) => c.fieldId === fact.fieldId);

    if (conflict?.kind === "conflict") {
      changes.push({
        fieldId: fact.fieldId,
        kind: "conflict",
        previousValue: conflict.previousValue ?? prev?.value ?? null,
        nextValue: conflict.incomingValue ?? fact.value,
        rawText: fact.rawText,
      });
      seen.add(fact.fieldId);
      continue;
    }

    if (fact.status === "corrected" || conflict?.kind === "correction") {
      changes.push({
        fieldId: fact.fieldId,
        kind: "corrected",
        previousValue: prev?.value ?? null,
        nextValue: next?.value ?? fact.value,
        rawText: fact.rawText,
      });
      seen.add(fact.fieldId);
      continue;
    }

    if (fact.status === "unknown") {
      changes.push({
        fieldId: fact.fieldId,
        kind: "unknown",
        previousValue: prev?.value ?? null,
        nextValue: null,
        rawText: fact.rawText,
      });
      seen.add(fact.fieldId);
      continue;
    }

    if (!prev || prev.value == null || prev.status === "unknown") {
      changes.push({
        fieldId: fact.fieldId,
        kind: "added",
        previousValue: null,
        nextValue: next?.value ?? fact.value,
        rawText: fact.rawText,
      });
    } else if (String(prev.value) !== String(next?.value ?? fact.value)) {
      changes.push({
        fieldId: fact.fieldId,
        kind: "updated",
        previousValue: prev.value,
        nextValue: next?.value ?? fact.value,
        rawText: fact.rawText,
      });
    } else {
      changes.push({
        fieldId: fact.fieldId,
        kind: "updated",
        previousValue: prev.value,
        nextValue: next?.value ?? fact.value,
        rawText: fact.rawText,
      });
    }
    seen.add(fact.fieldId);
  }

  for (const id of input.skippedThisTurn) {
    if (seen.has(id)) continue;
    changes.push({
      fieldId: id,
      kind: "skipped",
      previousValue: input.before.fields[id]?.value ?? null,
      nextValue: null,
    });
  }

  return changes;
}

function keepDraftWhenPolishFlips(draft: string, polished: string, userText: string): string {
  const next = polished.trim();
  if (!next) return draft;
  if (/不吵|安靜/.test(userText) && /吵/.test(next) && !/不吵|安靜/.test(next)) return draft;
  if (/沒特別異味|沒有異味|無異味/.test(userText) && /水損/.test(next) && !/壁癌|漏水|水漬/.test(userText)) {
    return draft;
  }
  if (/壁癌/.test(userText) && /水損(?:尚未|未確認|還沒)/.test(next)) return draft;
  return next;
}

async function readStreamText(stream: AsyncIterable<{ choices: Array<{ delta?: { content?: string | null } }> }>): Promise<string> {
  let text = "";
  for await (const chunk of stream) {
    text += chunk.choices[0]?.delta?.content ?? "";
  }
  return text.trim();
}

async function maybePolishReply(input: {
  apiKey?: string;
  draft: string;
  userText: string;
  locale?: string;
  signal?: AbortSignal;
}): Promise<{
  text: string;
  warning?: string;
  extractionStatus?: ExtractionStatus;
  rawAiResponse?: string;
}> {
  if (!input.apiKey || !input.userText.trim()) {
    return { text: input.draft, extractionStatus: "ok" };
  }

  try {
    const openai = new OpenAI({ apiKey: input.apiKey });
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0.7,
        stream: true,
        response_format: { type: "json_object" },
        max_tokens: 420,
        messages: [
          {
            role: "system",
            content: `${viewingRecorderSystemPrompt(input.locale)}

${viewingRecorderPolishRules(input.locale)}

本呼叫只潤飾回覆語氣與結構，不可新增、刪改已抽取的事實或追問清單外的題目。回覆 JSON only。`,
          },
          {
            role: "user",
            content: `使用者訊息：
${input.userText}

草稿回覆（請保留結構：先一句確認已理解 → 最多三個可選追問 → 可跳過提示。
不要再羅列「剛記入／已歸檔」的欄位清單——介面已另外顯示已記下的內容）：
${input.draft}

Return JSON: { "assistantMessage": string }`,
          },
        ],
      },
      { signal: input.signal ?? AbortSignal.timeout(20_000) },
    );

    const raw = await readStreamText(completion);
    const parsed = parseLlmJson(raw, PolishReplySchema);
    if (!parsed.ok) {
      // Draft already has rule-based facts — polish miss is soft, not "extraction failed"
      return {
        text: input.draft,
        warning: "polish_failed",
        extractionStatus: "ok",
        rawAiResponse: parsed.raw,
      };
    }
    return {
      text: parsed.data.assistantMessage.trim().slice(0, 2000),
      extractionStatus: "ok",
      rawAiResponse: parsed.raw,
    };
  } catch {
    return {
      text: input.draft,
      warning: "polish_failed",
      extractionStatus: "ok",
    };
  }
}

/**
 * Canonical conversation orchestrator: every user turn goes through the same pipeline.
 *
 * Engineering invariants:
 * 1) Extraction / merge / storage run on the server (API), not as sole client truth.
 * 2) Raw user message / captures are retained before any AI step — model failure must
 *    never drop user input.
 * 3) LLM JSON is Zod-validated; parse failure → keep raw, mark extraction_failed,
 *    do not overwrite prior good field data.
 * 4) Finish = user chose to stop, not “all fields filled”.
 *
 * Pipeline: intent → extract → merge → skippedFields + status → gaps → natural reply
 */
export async function processUserTurn(
  input: ProcessUserTurnInput,
): Promise<ProcessUserTurnResult> {
  const warnings: string[] = [];
  const message = input.message;
  const preservedMessageId = message.id;
  const before = toPropertyRecord(input.conversation);
  const priorEvidence = [...(input.conversation.evidence ?? [])];

  const storedCaptures = normalizeCaptures(
    message.id,
    input.captures,
    message,
  );

  const sourceText = uniqueJoinedText([
    message.transcript?.trim(),
    message.text?.trim(),
    ...storedCaptures
      .filter((c) => c.kind === "text" || c.kind === "transcript")
      .map((c) => c.text?.trim()),
  ]);

  const hasMedia = storedCaptures.some(
    (c) => c.kind === "photo" || c.kind === "video" || c.kind === "file",
  );
  const pendingVision = storedCaptures.some((c) => c.pendingVision);
  const incompleteTranscript =
    Boolean(message.transcriptIncomplete) ||
    storedCaptures.some((c) => c.transcriptIncomplete);

  if (!sourceText && !hasMedia) {
    warnings.push("empty_message");
  }
  if (pendingVision) {
    warnings.push("pending_vision");
  }
  if (incompleteTranscript) {
    warnings.push("incomplete_transcript");
  }

  // Classify on the original message + input captures only (storedCaptures
  // duplicate message.text and would break ^…$ skip patterns like「不知道」).
  const { intent, skippedFieldIds: intentSkips } = classifyTurnIntent({
    message,
    captures: input.captures ?? [],
  });

  // Bare "不知道": soft-skip current focus (or the single top gap) so dialogue never stalls
  const softSkips: PropertyFieldId[] =
    intent === "skip" && intentSkips.length === 0
      ? (() => {
          if (input.conversation.focusFieldIds?.length) {
            return [...input.conversation.focusFieldIds] as PropertyFieldId[];
          }
          const top = getNextQuestions(
            before,
            priorEvidence,
            before.skippedFields,
            message.locale ?? input.conversation.locale,
          ).slice(0, 1);
          return top.map((q) => q.fieldId);
        })()
      : [];

  // Always append captures first so media is never lost on later failures
  const recordWithCaptures: PropertyRecord = {
    ...before,
    captures: [...before.captures, ...storedCaptures],
  };

  const focusFieldIds = input.replyContext?.targetFieldIds.length
    ? input.replyContext.targetFieldIds
    : (input.conversation.focusFieldIds ?? []);
  const priorPending = input.conversation.pendingConfirm ?? null;
  const priorTurnCount = input.conversation.userTurnCount ?? 0;
  /** 招4 — this turn's 1-based index after completion */
  const userTurnCount = priorTurnCount + 1;

  // Use raw composer/transcript only for yes/no/vague (storedCaptures duplicate text)
  const shortIntentText = [
    message.transcript?.trim(),
    message.text?.trim(),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  // 招1 — Yes/No against pending confirm (before freeform extract)
  const confirmResolved = resolvePendingConfirm({
    text: shortIntentText,
    pending: priorPending,
    messageId: message.id,
  });

  // After「不對，…」strip the yes/no prefix so freeform extract maps the rest
  const freeformText = confirmResolved.clearPending
    ? confirmResolved.remainder
    : shortIntentText;
  const freeformForRules = confirmResolved.clearPending
    ? confirmResolved.remainder
    : message.text;
  const freeformForTranscript = confirmResolved.clearPending
    ? undefined
    : message.transcript;

  const ruleExtracted = extractPropertyFacts({
    text: freeformForRules,
    transcript: freeformForTranscript,
    messageId: message.id,
    locale: message.locale ?? input.conversation.locale,
    // While a Yes/No confirm is open, never dump freeform into that focus slot
    // (e.g.「裝潢狠心ㄟ」must not overwrite pending transit).
    focusFieldIds:
      priorPending && !confirmResolved.clearPending
        ? []
        : confirmResolved.facts.length && !confirmResolved.remainder
          ? []
          : focusFieldIds,
    captures: storedCaptures.map((c) => ({
      kind: c.kind,
      text: c.text,
      messageId: c.messageId,
      analysis: c.pendingVision ? undefined : c.analysis,
      mediaRef: c.mediaRef,
      visionSlots: c.visionSlots,
    })),
  });

  // 招3 — vague utterance → low confidence + clarify (do not confirmed-fill)
  const vagueFact = vagueFocusFact({
    text: freeformText,
    focusFieldIds,
    messageId: message.id,
  });
  const clarifyFieldIds: PropertyFieldId[] = [];
  if (vagueFact) {
    clarifyFieldIds.push(vagueFact.fieldId);
    warnings.push("vague_utterance");
  }

  // Implicit (B): optional LLM extract — skip pure yes/no with no remainder
  const skipLlm =
    (confirmResolved.facts.length > 0 && !confirmResolved.remainder) ||
    (isVagueUtterance(freeformText) && freeformText.trim().length < 12);
  const replyNote = input.replyContext
    ? `\n使用者正在回覆這則訊息：「${input.replyContext.quotedText.slice(0, 200)}」；相關欄位：${input.replyContext.targetFieldIds.join(", ") || "未知"}。請判斷是補充或更正；更正時該欄位 status 設為 corrected。`
    : "";
  const llmExtract = skipLlm
    ? { fields: [] as ExtractedPropertyFact[] }
    : await extractPropertyFactsWithLlm({
        apiKey: input.apiKey,
        text: `${freeformText || sourceText}${replyNote}`,
        messageId: message.id,
        locale: message.locale ?? input.conversation.locale,
        signal: input.signal,
        replyNote,
      });
  if ("warning" in llmExtract && llmExtract.warning) {
    warnings.push(llmExtract.warning);
  }

  const llmFacts = llmExtract.fields.filter((fact) => {
    if (fact.fieldId === "water_damage" && !/壁癌|水損|水漬|滲漏|漏水|滲水/.test(freeformText)) {
      return false;
    }
    if (
      fact.fieldId === "noise" &&
      /不吵|安靜/.test(freeformText) &&
      /吵/.test(String(fact.value ?? "")) &&
      !/不吵|安靜/.test(String(fact.value ?? ""))
    ) {
      return false;
    }
    return true;
  });
  let extractedFields = mergeRuleAndLlmFacts(ruleExtracted.fields, llmFacts);
  if (confirmResolved.facts.length) {
    extractedFields = mergeRuleAndLlmFacts(confirmResolved.facts, extractedFields);
  } else if (vagueFact) {
    // Prefer vague placeholder over accidental confirmed focus fill
    extractedFields = mergeRuleAndLlmFacts(
      [vagueFact],
      extractedFields.filter((f) => f.fieldId !== vagueFact.fieldId),
    );
  }
  if (input.replyContext?.targetFieldIds.length) {
    const targets = new Set(input.replyContext.targetFieldIds);
    extractedFields = extractedFields.map((fact) => {
      if (!targets.has(fact.fieldId)) return fact;
      const prev = recordWithCaptures.fields[fact.fieldId];
      if (prev?.value != null && String(prev.value) !== String(fact.value ?? "")) {
        return { ...fact, status: "corrected" as const };
      }
      return fact;
    });
  }

  const extracted = {
    ...ruleExtracted,
    fields: extractedFields,
  };

  const skippedFields = [
    ...new Set([
      ...recordWithCaptures.skippedFields,
      ...intentSkips,
      ...softSkips,
      ...extracted.skippedFieldIds,
    ]),
  ] as PropertyFieldId[];

  const nextStatus = deriveStatus(intent, input.conversation.status);
  const mergeMode =
    nextStatus === "reviewing" || nextStatus === "completed"
      ? "confirming"
      : "collecting";

  const merged = mergePropertyFacts(recordWithCaptures, extracted.fields, {
    evidence: priorEvidence,
    mode: mergeMode,
  });

  const updatedRecord: PropertyRecord = {
    ...merged.record,
    skippedFields,
    captures: recordWithCaptures.captures,
    mode: mergeMode,
  };

  const changes = buildChanges({
    before,
    after: updatedRecord,
    extracted: extracted.fields,
    conflicts: merged.conflicts,
    skippedThisTurn: [...intentSkips, ...softSkips, ...extracted.skippedFieldIds],
  });

  const changedFieldIds = changes
    .filter(
      (c) =>
        c.kind === "added" ||
        c.kind === "updated" ||
        c.kind === "corrected" ||
        c.kind === "conflict",
    )
    .map((c) => c.fieldId);

  // 招1 — next pending confirm (cleared on yes/no; else pick inferred)
  let nextPending: PendingConfirmState | null = priorPending;
  if (confirmResolved.clearPending) {
    nextPending = null;
  }
  if (!nextPending && nextStatus === "collecting") {
    nextPending = pickPendingConfirmFromRecord(updatedRecord);
  }

  // User changed topic while a confirm was open — file freeform first, don't
  // re-trap them in the same Yes/No bubble this turn (pending stays for later).
  const divertedFromConfirm =
    Boolean(priorPending) &&
    !confirmResolved.clearPending &&
    extracted.fields.some(
      (f) =>
        f.fieldId !== priorPending!.fieldId &&
        f.status !== "unknown" &&
        f.value != null &&
        f.value !== "",
    );

  const suggestedQuestions: SuggestedQuestion[] =
    nextStatus === "reviewing" || nextStatus === "completed"
      ? []
      : getNextQuestions({
          record: updatedRecord,
          evidence: merged.evidence,
          skippedFields,
          locale: message.locale ?? input.conversation.locale,
          changedFieldIds,
          userTurnCount,
          clarifyFieldIds,
          pendingConfirm: divertedFromConfirm ? null : nextPending,
          askedCount: input.conversation.askedCount ?? {},
        });

  const nextFocusFieldIds = (() => {
    const top = suggestedQuestions[0];
    if (!top) return [] as PropertyFieldId[];
    if (top.fieldIds?.length) return [...top.fieldIds];
    return [top.fieldId];
  })();

  // If we emitted a confirm question, keep that as pending for next turn
  const confirmQ = suggestedQuestions.find((q) => q.kind === "confirm");
  if (confirmQ?.candidateValue) {
    nextPending = {
      fieldId: confirmQ.fieldId,
      candidateValue: confirmQ.candidateValue,
      source: nextPending?.source ?? "inferred",
    };
  } else if (!confirmQ && !divertedFromConfirm) {
    // No confirm question in the list — don't force pending unless inferred still open
    if (!nextPending || isFieldConfirmed(updatedRecord, nextPending.fieldId)) {
      nextPending = null;
    }
  }
  // divertedFromConfirm: keep nextPending (prior) so we can re-ask later

  let assistantMessage = composeAssistantMessage({
    intent,
    sourceText: sourceText || message.text || message.transcript || "",
    changes,
    questions: suggestedQuestions,
    status: nextStatus,
    warnings,
    extracted: extracted.fields,
  });

  const polished = input.polishReply
    ? await input.polishReply(assistantMessage, sourceText).catch(() => ({
        text: assistantMessage,
        warning: "polish_failed" as const,
        extractionStatus: "ok" as ExtractionStatus,
        rawAiResponse: undefined as string | undefined,
      }))
    : await maybePolishReply({
        apiKey: input.apiKey,
        draft: assistantMessage,
        userText: sourceText,
        locale: message.locale ?? input.conversation.locale,
        signal: input.signal,
      });
  const locale = message.locale ?? input.conversation.locale ?? "zh-Hant";
  assistantMessage = stripInternalKeys(
    keepDraftWhenPolishFlips(assistantMessage, polished.text, sourceText || message.text || ""),
    locale,
  );
  if (polished.warning) warnings.push(polished.warning);

  let nextAsked = { ...(input.conversation.askedCount ?? {}) };
  const questionKey = suggestedQuestions[0]?.fieldId;
  if (questionKey) {
    nextAsked = markAsked({ answered: {}, askedCount: nextAsked }, questionKey).askedCount;
  }
  for (const fact of extracted.fields) {
    if (fact.value == null || fact.value === "" || fact.status === "unknown") continue;
    nextAsked = markAnswered(
      { answered: {}, askedCount: nextAsked },
      fact.fieldId,
      String(fact.value),
    ).askedCount;
  }

  const extractionStatus: ExtractionStatus =
    polished.extractionStatus === "extraction_failed" ||
    polished.warning === "extraction_failed" ||
    polished.warning === "llm_schema_invalid"
      ? "extraction_failed"
      : "ok";

  return {
    assistantMessage,
    updatedRecord,
    updatedEvidence: merged.evidence,
    suggestedQuestions,
    changes,
    conversationStatus: nextStatus,
    intent,
    warnings,
    preservedMessageId,
    extractionStatus,
    rawAiResponse:
      ("rawAiResponse" in polished ? polished.rawAiResponse : undefined) ??
      ("rawAiResponse" in llmExtract ? llmExtract.rawAiResponse : undefined),
    focusFieldIds: nextFocusFieldIds,
    pendingConfirm: nextPending,
    askedCount: nextAsked,
  };
}

function isFieldConfirmed(
  record: PropertyRecord,
  fieldId: PropertyFieldId,
): boolean {
  const f = record.fields[fieldId];
  return Boolean(
    f &&
      (f.status === "confirmed" || f.status === "corrected") &&
      f.value != null &&
      f.value !== "" &&
      (f.confidence ?? 0) > 0.25,
  );
}

export function createConversationState(input?: {
  address?: string | null;
  locale?: string;
  status?: ConversationStatus;
}): ConversationState {
  const address = input?.address ?? null;
  const record: PropertyRecord = {
    ...createEmptyPropertyRecord({
      address,
      mode: "collecting",
      fields: address
        ? {
            address: {
              fieldId: "address",
              value: address,
              status: "confirmed",
              confidence: 0.95,
              sourceMessageId: null,
              rawText: address,
              updatedAt: new Date().toISOString(),
            },
          }
        : {},
    }),
    skippedFields: [],
    captures: [],
  };

  return {
    status: input?.status ?? "collecting",
    record,
    evidence: [],
    address,
    locale: input?.locale,
    focusFieldIds: [],
    pendingConfirm: null,
    userTurnCount: 0,
  };
}
