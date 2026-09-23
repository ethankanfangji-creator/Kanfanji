import OpenAI from "openai";
import { sanitizeCitedStrings, assertCitations } from "@/lib/property-facts/citations";
import {
  buildLlmPropertyPayload,
  llmPropertySystemRules,
} from "@/lib/security/llm-redact";
import { recordPropertyAudit } from "@/lib/property-domain/audit";
import type { PropertyReport } from "@/lib/property-facts/report-types";
import {
  agendaIdToFieldId,
  createConversationState,
  fieldIdToMatchedId,
  processUserTurn,
  VIEWING_RECORDER_REPORT_RULES,
} from "@/lib/viewing-chat/collection";
import {
  ChatReportLlmSchema,
  parseLlmJson,
} from "@/lib/viewing-chat/collection/llm-schemas";
import type {
  PropertyCollectionRecord,
  PropertyFactEvidence,
  PropertyFieldId,
} from "@/lib/viewing-chat/collection/types";
import type {
  ExtractionStatus,
  PropertyRecord,
} from "@/lib/viewing-chat/collection/orchestrator-types";
import {
  createAiMessage,
  createUserMessage,
  DEFAULT_QUESTION_BANK,
  type ChatMessage,
  type ChatReportSnapshot,
} from "./types";
import { projectQuestionBank } from "./project-bank";

function asPropertyRecord(
  record: PropertyCollectionRecord | null | undefined,
  address: string,
  skipped: PropertyFieldId[],
): PropertyRecord {
  const conversation = createConversationState({ address });
  if (!record) {
    return {
      ...conversation.record,
      skippedFields: skipped,
    };
  }
  return {
    ...record,
    fields: { ...record.fields },
    skippedFields: skipped,
    captures: (record as PropertyRecord).captures ?? [],
  };
}

function fieldIdToAgendaSkip(fieldId: PropertyFieldId): string {
  const map: Record<string, string> = {
    layout: "q_layout",
    noise: "q_noise",
    odor: "q_odor",
    light: "q_light",
    water_damage: "q_water_damage",
    electrical: "q_electrical",
    plumbing: "q_plumbing",
    hvac: "q_hvac",
    parking: "q_storage_parking",
  };
  return map[fieldId] ?? fieldId;
}

/** Remove「答案\n答案」echo from capture/message double-join. */
function stripFiledChangesBlock(text: string): string {
  const parts = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter(
      (p) =>
        !/^(這一輪新收到|剛記入的變更|What changed this turn|Here's what we just filed)/i.test(
          p,
        ),
    );
  return parts.join("\n\n").trim();
}

function collapseRepeatedAnswer(answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed) return "";
  const lines = trimmed
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length >= 2 && lines.every((l) => l === lines[0])) {
    return lines[0]!;
  }
  // Exact doubled string without newline: "foo"+"foo"
  if (trimmed.length % 2 === 0) {
    const half = trimmed.length / 2;
    const a = trimmed.slice(0, half);
    const b = trimmed.slice(half);
    if (a === b && a.length >= 2) return a;
  }
  return trimmed;
}

export async function integrateChatTurn(input: {
  apiKey: string;
  address: string;
  locale: string;
  messages: ChatMessage[];
  userText: string;
  transcript: string;
  hasPhoto: boolean;
  /** Vision/OCR notes — treated as untrusted observations */
  photoAnalysis?: string;
  /** Structured vision slots (inferred only) */
  visionSlots?: Array<{
    fieldId: string;
    value: string;
    confidence?: number;
    note?: string;
  }>;
  replyTo?: ChatMessage["replyTo"];
  agendaActiveId?: string | null;
  agendaSkippedIds?: string[];
  agendaMarket?: "US" | "CA" | "TW" | "OTHER" | null;
  propertyRecord?: PropertyCollectionRecord | null;
  propertyEvidence?: PropertyFactEvidence[];
  collectionSkippedFields?: PropertyFieldId[];
  /** Explicit (A) soft focus from prior AI reminder */
  collectionFocusFieldIds?: PropertyFieldId[];
  /** 招1 — pending yes/no candidate */
  pendingConfirm?: import("@/lib/viewing-chat/collection/orchestrator-types").PendingConfirmState | null;
  signal?: AbortSignal;
  /**
   * Called after the raw user message is built and appended, before AI polish.
   * Use to persist messages so a model failure cannot erase user input.
   */
  beforeExtraction?: (
    userMessage: ChatMessage,
    messagesWithUser: ChatMessage[],
  ) => Promise<void>;
}): Promise<{
  userMessage: ChatMessage;
  aiMessage: ChatMessage;
  messages: ChatMessage[];
  agendaActiveId: string | null;
  agendaSkippedIds: string[];
  propertyRecord: PropertyCollectionRecord;
  propertyEvidence: PropertyFactEvidence[];
  collectionSkippedFields: PropertyFieldId[];
  changes: import("@/lib/viewing-chat/collection").RecordChange[];
  conversationStatus: import("@/lib/viewing-chat/collection").ConversationStatus;
  turnWarnings: string[];
  suggestedQuestions: import("@/lib/viewing-chat/collection").SuggestedQuestion[];
  extractionStatus: ExtractionStatus;
  rawAiResponse?: string;
  collectionFocusFieldIds: PropertyFieldId[];
  pendingConfirm: import("@/lib/viewing-chat/collection/orchestrator-types").PendingConfirmState | null;
}> {
  // 1) Persist raw user message first — never wait for AI
  const userMessage = createUserMessage({
    type: input.hasPhoto ? "photo" : input.transcript.trim() ? "audio" : "text",
    text: input.userText.trim() || undefined,
    transcript: input.transcript.trim() || undefined,
    replyTo: input.replyTo,
    analysis: input.photoAnalysis || undefined,
  });
  const messagesWithUser = [...input.messages, userMessage];
  if (input.beforeExtraction) {
    await input.beforeExtraction(userMessage, messagesWithUser);
  }

  const priorSkipped = [
    ...new Set([
      ...(input.collectionSkippedFields ?? []),
      ...(input.agendaSkippedIds ?? []).map((id) => agendaIdToFieldId(id)),
    ]),
  ] as PropertyFieldId[];

  const priorRecord = asPropertyRecord(
    input.propertyRecord,
    input.address,
    priorSkipped,
  );
  const priorEvidence = input.propertyEvidence ?? [];
  const userTurnCount = input.messages.filter((m) => m.role === "user").length;

  const status =
    priorRecord.mode === "confirming" || priorRecord.mode === "reporting"
      ? ("reviewing" as const)
      : ("collecting" as const);

  const turn = await processUserTurn({
    conversation: {
      status,
      record: priorRecord,
      evidence: priorEvidence,
      address: input.address,
      locale: input.locale,
      focusFieldIds: input.collectionFocusFieldIds ?? [],
      pendingConfirm: input.pendingConfirm ?? null,
      userTurnCount,
    },
    message: {
      id: userMessage.id,
      text: input.userText,
      transcript: input.transcript,
      transcriptIncomplete:
        Boolean(input.transcript.trim()) && input.transcript.trim().length < 3,
      locale: input.locale,
    },
    captures: input.hasPhoto
      ? [
          {
            kind: "photo",
            messageId: userMessage.id,
            analysis: input.photoAnalysis,
            visionSlots: input.visionSlots,
          },
        ]
      : undefined,
    apiKey: input.apiKey,
    signal: input.signal,
  });

  const matchedRaw = turn.changes
    .filter(
      (c) =>
        c.kind === "added" ||
        c.kind === "updated" ||
        c.kind === "corrected",
    )
    .map((c) => ({
      id: fieldIdToMatchedId(c.fieldId),
      answer: collapseRepeatedAnswer(
        c.nextValue === null || c.nextValue === undefined
          ? c.rawText || ""
          : typeof c.nextValue === "number" &&
              c.nextValue >= 10_000 &&
              c.nextValue % 10_000 === 0
            ? `${c.nextValue / 10_000}萬`
            : String(c.nextValue),
      ),
    }))
    .filter((m) => m.answer);

  // One chip per field — avoid duplicate「已記下」for the same slot
  const matchedById = new Map<string, { id: string; answer: string }>();
  for (const row of matchedRaw) {
    if (!matchedById.has(row.id)) matchedById.set(row.id, row);
  }
  const matched = [...matchedById.values()];

  const kind =
    turn.intent === "finish"
      ? "follow_up"
      : matched.length > 0
        ? "fill"
        : "follow_up";

  const extractionFailed = turn.extractionStatus === "extraction_failed";

  // When UI renders matched chips, drop the prose「剛記入」block so facts aren't shown twice
  const assistantText = matched.length
    ? stripFiledChangesBlock(turn.assistantMessage)
    : turn.assistantMessage;

  const aiMessage = createAiMessage({
    type: kind,
    text: assistantText,
    matched: matched.length ? matched : undefined,
    analysis: extractionFailed
      ? "extraction_failed"
      : turn.warnings.includes("pending_vision")
        ? "影像辨識尚未完成（未當確定事實）"
        : turn.changes.some((c) => c.kind === "conflict")
          ? `欄位衝突待確認：${turn.changes
              .filter((c) => c.kind === "conflict")
              .map((c) => c.fieldId)
              .slice(0, 3)
              .join("、")}`
          : undefined,
  });

  const agendaSkippedIds = [
    ...new Set([
      ...(input.agendaSkippedIds ?? []),
      ...turn.updatedRecord.skippedFields.map((id) =>
        id.startsWith("q_") ? id : fieldIdToAgendaSkip(id),
      ),
    ]),
  ];

  const focusMatchedId = turn.suggestedQuestions[0]
    ? fieldIdToMatchedId(turn.suggestedQuestions[0].fieldId)
    : null;

  // Strip orchestrator-only fields when storing as collection record
  const { skippedFields, captures: _captures, ...collectionFields } =
    turn.updatedRecord;
  const propertyRecord: PropertyCollectionRecord = {
    address: collectionFields.address,
    mode: collectionFields.mode,
    fields: collectionFields.fields,
    updatedAt: collectionFields.updatedAt,
  };
  void _captures;

  return {
    userMessage,
    aiMessage,
    messages: [...messagesWithUser, aiMessage],
    agendaActiveId: focusMatchedId,
    agendaSkippedIds,
    propertyRecord,
    propertyEvidence: turn.updatedEvidence,
    collectionSkippedFields: skippedFields,
    changes: turn.changes,
    conversationStatus: turn.conversationStatus,
    turnWarnings: turn.warnings,
    suggestedQuestions: turn.suggestedQuestions,
    extractionStatus: turn.extractionStatus,
    rawAiResponse: turn.rawAiResponse,
    collectionFocusFieldIds: turn.focusFieldIds,
    pendingConfirm: turn.pendingConfirm,
  };
}

export async function buildChatReport(input: {
  apiKey: string;
  address: string;
  locale: string;
  messages: ChatMessage[];
  /** Structured property report — LLM may only cite evidence values from this. */
  propertyReport?: import("@/lib/property-facts/report-types").PropertyReport | null;
  signal?: AbortSignal;
}): Promise<{ report: ChatReportSnapshot; aiMessage: ChatMessage; extractionStatus: "ok" | "extraction_failed"; rawAiResponse?: string }> {
  const openai = new OpenAI({ apiKey: input.apiKey });
  const bank = projectQuestionBank(input.messages);
  const transcript = input.messages
    .map((m) => {
      if (m.role === "user") {
        return `USER: ${m.transcript || m.text || m.analysis || "(media)"}`;
      }
      return `AI: ${m.text || ""}${m.matched ? ` matched=${JSON.stringify(m.matched)}` : ""}`;
    })
    .join("\n")
    .slice(0, 12_000);

  const propertyFactsBlock = input.propertyReport
    ? (() => {
        const payload = buildLlmPropertyPayload(input.propertyReport as PropertyReport, {
          includeRawEvidence: false,
        });
        void recordPropertyAudit({
          actor: "system",
          action: "llm_export",
          country: payload.country,
          meta: { evidenceCount: payload.evidence.length, redacted: true },
        });
        const untrusted =
          payload.untrusted_blocks.length > 0
            ? `\nUNTRUSTED_SNIPPETS:\n${payload.untrusted_blocks.join("\n")}`
            : "";
        return (
          JSON.stringify(
            {
              redacted: payload.redacted,
              address: payload.address,
              country: payload.country,
              evidence: payload.evidence,
              data_gaps: payload.data_gaps,
              narrative_summary_zh: payload.narrative_summary_zh,
              disclaimer: payload.disclaimer,
            },
            null,
            0,
          ).slice(0, 8_000) + untrusted
        );
      })()
    : "(no structured property evidence — use chat only; do not invent listing facts)";

  const completion = await openai.chat.completions.create(
    {
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content: `${VIEWING_RECORDER_REPORT_RULES}

Create a concise open-house report from chat + PROPERTY_EVIDENCE only.
- ${llmPropertySystemRules()}
- Any numeric or listing fact in the summary/pros/risks MUST cite an evidence id from PROPERTY_EVIDENCE (e.g. [ev_3_year_built]).
- If a field is in data_gaps or needs_human, say it is unconfirmed — never invent.
- Do not invent flood/earthquake/tax/HOA/price when evidence is missing.
- Prefer aligning with narrative_summary_zh when present; keep original EN/FR snippets untranslated when quoting fenced sources.
- Write visible report text in 繁體中文 unless the chat majority is another language.`,
        },
        {
          role: "user",
          content: `Address: ${input.address}
PROPERTY_EVIDENCE:
${propertyFactsBlock}
Bank memory:
${bank.map((b) => `- ${b.question}: ${b.answer || "unknown"}`).join("\n")}
Chat:
${transcript}

Return JSON:
{
  "pros": string[3],
  "risks": string[3],
  "checklist": [{"id": string, "question": string, "answer": string, "status": "ok"|"risk"|"unknown"}],
  "summary": string
}`,
        },
      ],
    },
    { signal: input.signal ?? AbortSignal.timeout(45_000) },
  );

  const raw = completion.choices[0]?.message?.content?.trim() || "{}";
  const llmParsed = parseLlmJson(raw, ChatReportLlmSchema);
  if (!llmParsed.ok) {
    // Schema failure: do not invent report fields from bad JSON; fall back to bank only
    const report: ChatReportSnapshot = {
      pros: ["採光／格局待確認", "社區機能待確認", "現場感覺待補充"],
      risks: ["屋況細節未足", "費用文件未核對", "噪音／鄰居未知"],
      checklist: DEFAULT_QUESTION_BANK.map((item) => {
        const hit = bank.find((b) => b.id === item.id);
        return {
          id: item.id,
          question: item.question,
          answer: hit?.answer || "",
          status: (hit?.answer ? "ok" : "unknown") as "ok" | "unknown",
        };
      }),
      summary: "報告整理暫時失敗，對話內容已保留。可重試產生報告。",
      generatedAt: new Date().toISOString(),
    };
    const aiMessage = createAiMessage({
      type: "report",
      text: report.summary,
      report,
      analysis: "extraction_failed",
    });
    return { report, aiMessage, extractionStatus: "extraction_failed" as const, rawAiResponse: llmParsed.raw };
  }

  const parsed = llmParsed.data;

  const asStringList = (value: string[] | undefined, fallback: string[]): string[] => {
    if (!value) return fallback;
    const list = value.map((item) => item.trim()).filter(Boolean).slice(0, 3);
    return list.length ? list : fallback;
  };

  const checklist =
    parsed.checklist?.map((row, index) => ({
      id: row.id || `c_${index}`,
      question: row.question,
      answer: row.answer,
      status: row.status,
    })) ?? [];

  const allowedEvidenceIds = (input.propertyReport?.evidence ?? []).map((e) => e.id);

  const report: ChatReportSnapshot = {
    pros: sanitizeCitedStrings(
      asStringList(parsed.pros, ["採光／格局待確認", "社區機能待確認", "現場感覺待補充"]),
      allowedEvidenceIds,
    ).values,
    risks: sanitizeCitedStrings(
      asStringList(parsed.risks, ["屋況細節未足", "費用文件未核對", "噪音／鄰居未知"]),
      allowedEvidenceIds,
    ).values,
    checklist:
      checklist.length > 0
        ? checklist.map((row) => ({
            ...row,
            answer: assertCitations(row.answer, allowedEvidenceIds).strippedText || row.answer,
          }))
        : DEFAULT_QUESTION_BANK.map((item) => {
            const hit = bank.find((b) => b.id === item.id);
            return {
              id: item.id,
              question: item.question,
              answer: hit?.answer || "",
              status: (hit?.answer ? "ok" : "unknown") as "ok" | "unknown",
            };
          }),
    summary: parsed.summary
      ? assertCitations(parsed.summary, allowedEvidenceIds).strippedText || parsed.summary
      : undefined,
    generatedAt: new Date().toISOString(),
  };

  const aiMessage = createAiMessage({
    type: "report",
    text: report.summary || "報告已生成，可分享連結。",
    report,
  });

  return {
    report,
    aiMessage,
    extractionStatus: "ok" as const,
    rawAiResponse: llmParsed.raw,
  };
}
