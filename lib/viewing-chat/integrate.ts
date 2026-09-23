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
} from "@/lib/viewing-chat/collection";
import type {
  PropertyCollectionRecord,
  PropertyFactEvidence,
  PropertyFieldId,
} from "@/lib/viewing-chat/collection/types";
import type { PropertyRecord } from "@/lib/viewing-chat/collection/orchestrator-types";
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
  replyTo?: ChatMessage["replyTo"];
  agendaActiveId?: string | null;
  agendaSkippedIds?: string[];
  agendaMarket?: "US" | "CA" | "TW" | "OTHER" | null;
  propertyRecord?: PropertyCollectionRecord | null;
  propertyEvidence?: PropertyFactEvidence[];
  collectionSkippedFields?: PropertyFieldId[];
  signal?: AbortSignal;
}): Promise<{
  userMessage: ChatMessage;
  aiMessage: ChatMessage;
  messages: ChatMessage[];
  agendaActiveId: string | null;
  agendaSkippedIds: string[];
  propertyRecord: PropertyCollectionRecord;
  propertyEvidence: PropertyFactEvidence[];
  collectionSkippedFields: PropertyFieldId[];
}> {
  const userMessage = createUserMessage({
    type: input.hasPhoto ? "photo" : input.transcript.trim() ? "audio" : "text",
    text: input.userText.trim() || undefined,
    transcript: input.transcript.trim() || undefined,
    replyTo: input.replyTo,
    analysis: input.photoAnalysis || undefined,
  });

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

  const status =
    priorRecord.mode === "confirming" || priorRecord.mode === "reporting"
      ? ("reviewing" as const)
      : ("collecting" as const);

  const turn = await processUserTurn({
    conversation: {
      status,
      record: priorRecord,
      evidence: input.propertyEvidence ?? [],
      address: input.address,
      locale: input.locale,
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
          },
        ]
      : undefined,
    apiKey: input.apiKey,
    signal: input.signal,
  });

  const matched = turn.changes
    .filter(
      (c) =>
        c.kind === "added" ||
        c.kind === "updated" ||
        c.kind === "corrected",
    )
    .map((c) => ({
      id: fieldIdToMatchedId(c.fieldId),
      answer:
        c.nextValue === null || c.nextValue === undefined
          ? c.rawText || ""
          : typeof c.nextValue === "number" &&
              c.nextValue >= 10_000 &&
              c.nextValue % 10_000 === 0
            ? `${c.nextValue / 10_000}萬`
            : String(c.nextValue),
    }))
    .filter((m) => m.answer);

  const kind =
    turn.intent === "finish"
      ? "follow_up"
      : matched.length > 0
        ? "fill"
        : "follow_up";

  const aiMessage = createAiMessage({
    type: kind,
    text: turn.assistantMessage,
    matched: matched.length ? matched : undefined,
    analysis: turn.warnings.includes("pending_vision")
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
    messages: [...input.messages, userMessage, aiMessage],
    agendaActiveId: focusMatchedId,
    agendaSkippedIds,
    propertyRecord,
    propertyEvidence: turn.updatedEvidence,
    collectionSkippedFields: skippedFields,
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
}): Promise<{ report: ChatReportSnapshot; aiMessage: ChatMessage }> {
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
          content: `Create a concise open-house report.
Rules:
- Chat observations and structured PROPERTY_EVIDENCE are the only sources.
- ${llmPropertySystemRules()}
- Any numeric or listing fact in the summary/pros/risks MUST cite an evidence id from PROPERTY_EVIDENCE (e.g. [ev_3_year_built]).
- If a field is in data_gaps or needs_human, say it is unconfirmed — never invent.
- Do not invent flood/earthquake/tax/HOA/price when evidence is missing.
- Prefer aligning with narrative_summary_zh when present; keep original EN/FR snippets untranslated when quoting fenced sources.`,
        },
        {
          role: "user",
          content: `Address: ${input.address}
Write the report in the SAME language as the majority of user messages in the chat (not a fixed UI locale).
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
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const asStringList = (value: unknown, fallback: string[]): string[] => {
    if (!Array.isArray(value)) return fallback;
    const list = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 3);
    return list.length ? list : fallback;
  };

  const checklistRaw = Array.isArray(parsed.checklist) ? parsed.checklist : [];
  const checklist = checklistRaw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const status =
        row.status === "ok" || row.status === "risk" || row.status === "unknown"
          ? row.status
          : "unknown";
      return {
        id: typeof row.id === "string" ? row.id : `c_${index}`,
        question: typeof row.question === "string" ? row.question : `Item ${index + 1}`,
        answer: typeof row.answer === "string" ? row.answer : "",
        status,
      };
    })
    .filter(Boolean) as ChatReportSnapshot["checklist"];

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
    summary:
      typeof parsed.summary === "string"
        ? assertCitations(parsed.summary, allowedEvidenceIds).strippedText || parsed.summary
        : undefined,
    generatedAt: new Date().toISOString(),
  };

  const aiMessage = createAiMessage({
    type: "report",
    text: report.summary || "報告已生成，可分享連結。",
    report,
  });

  return { report, aiMessage };
}
