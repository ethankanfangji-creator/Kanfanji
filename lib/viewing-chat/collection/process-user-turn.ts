import OpenAI from "openai";
import { classifyTurnIntent } from "./classify-turn-intent";
import { composeAssistantMessage } from "./compose-assistant-message";
import { extractPropertyFacts } from "./extract-property-facts";
import { getNextQuestions } from "./get-next-questions";
import { createEmptyPropertyRecord, mergePropertyFacts } from "./merge-property-facts";
import type {
  ConversationState,
  ConversationStatus,
  FieldEvidence,
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

async function maybePolishReply(input: {
  apiKey?: string;
  draft: string;
  userText: string;
  signal?: AbortSignal;
}): Promise<{ text: string; warning?: string }> {
  if (!input.apiKey || !input.userText.trim()) {
    return { text: input.draft };
  }

  try {
    const openai = new OpenAI({ apiKey: input.apiKey });
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        max_tokens: 420,
        messages: [
          {
            role: "system",
            content:
              "Polish an on-site viewing assistant reply. Keep the same facts and question list. Never invent prices/area/floor/distance/equipment. Never scold the user for answering out of order. Match the user's language. Return JSON only.",
          },
          {
            role: "user",
            content: `User message:
${input.userText}

Draft reply (preserve structure: understand → changes → optional questions → skip hint):
${input.draft}

Return JSON: { "assistantMessage": string }`,
          },
        ],
      },
      { signal: input.signal ?? AbortSignal.timeout(20_000) },
    );

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    try {
      const parsed = JSON.parse(raw) as { assistantMessage?: unknown };
      const text =
        typeof parsed.assistantMessage === "string"
          ? parsed.assistantMessage.trim()
          : "";
      if (!text) {
        return { text: input.draft, warning: "llm_schema_invalid" };
      }
      return { text: text.slice(0, 2000) };
    } catch {
      return { text: input.draft, warning: "llm_schema_invalid" };
    }
  } catch {
    return { text: input.draft, warning: "llm_failed" };
  }
}

/**
 * Canonical conversation orchestrator: every user turn goes through the same pipeline.
 *
 * 1) intent → 2) extract all facts → 3) merge facts/evidence/captures →
 * 4) skippedFields + status → 5) important gaps → 6) natural reply
 *
 * On AI / network failure, rule-based extract + merge still run; raw captures are kept.
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

  const sourceText = [
    message.transcript?.trim(),
    message.text?.trim(),
    ...storedCaptures
      .filter((c) => c.kind === "text" || c.kind === "transcript")
      .map((c) => c.text?.trim()),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

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

  const { intent, skippedFieldIds: intentSkips } = classifyTurnIntent({
    message,
    captures: storedCaptures,
  });

  // Always append captures first so media is never lost on later failures
  const recordWithCaptures: PropertyRecord = {
    ...before,
    captures: [...before.captures, ...storedCaptures],
  };

  const extracted = extractPropertyFacts({
    text: message.text,
    transcript: message.transcript,
    messageId: message.id,
    locale: message.locale ?? input.conversation.locale,
    captures: storedCaptures.map((c) => ({
      kind: c.kind,
      text: c.text,
      messageId: c.messageId,
      // Only pass analysis when vision completed — avoids fake inferred facts
      analysis: c.pendingVision ? undefined : c.analysis,
      mediaRef: c.mediaRef,
    })),
  });

  const skippedFields = [
    ...new Set([
      ...recordWithCaptures.skippedFields,
      ...intentSkips,
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
    skippedThisTurn: [...intentSkips, ...extracted.skippedFieldIds],
  });

  const suggestedQuestions: SuggestedQuestion[] =
    nextStatus === "reviewing" || nextStatus === "completed"
      ? []
      : getNextQuestions(
          updatedRecord,
          merged.evidence,
          skippedFields,
          message.locale ?? input.conversation.locale,
        ).map((q) => ({
          fieldId: q.fieldId,
          question: q.question,
          priority: q.priority,
          skippable: true as const,
        }));

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
        warning: "llm_failed",
      }))
    : await maybePolishReply({
        apiKey: input.apiKey,
        draft: assistantMessage,
        userText: sourceText,
        signal: input.signal,
      });
  assistantMessage = polished.text;
  if (polished.warning) warnings.push(polished.warning);

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
  };
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
  };
}
