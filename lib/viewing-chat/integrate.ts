import OpenAI from "openai";
import { sanitizeCitedStrings, assertCitations } from "@/lib/property-facts/citations";
import {
  buildLlmPropertyPayload,
  llmPropertySystemRules,
} from "@/lib/security/llm-redact";
import { recordPropertyAudit } from "@/lib/property-domain/audit";
import type { PropertyReport } from "@/lib/property-facts/report-types";
import {
  createAiMessage,
  createUserMessage,
  DEFAULT_QUESTION_BANK,
  type ChatMessage,
  type ChatReportSnapshot,
} from "./types";
import { projectQuestionBank } from "./project-bank";
import {
  formatAgendaForPrompt,
  getActiveAgendaItem,
  inferAgendaMarket,
  projectAgenda,
  resolveNextActiveId,
  suggestTopicFromUserText,
  type AgendaAction,
  type AgendaMarket,
} from "./agenda";
import { createAgendaLabelResolver } from "./agenda-labels";
import {
  pinMatchedToActiveTopic,
  isShortGenericReply,
  sanitizeAnalysisNote,
  sanitizeMatchedHits,
} from "./sanitize-turn";
import { resolveAgendaId } from "./agenda-catalog";
import type { Messages } from "@/lib/i18n/types";
import zhHant from "@/lib/i18n/messages/zh-Hant";
import zhHans from "@/lib/i18n/messages/zh-Hans";
import en from "@/lib/i18n/messages/en";
import th from "@/lib/i18n/messages/th";

function chatCopyForLocale(locale: string): Messages["chat"] {
  if (locale.startsWith("zh-Hans") || locale === "zh-CN") return zhHans.chat;
  if (locale.startsWith("th")) return th.chat;
  if (locale.startsWith("en")) return en.chat;
  return zhHant.chat;
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
  agendaMarket?: AgendaMarket | null;
  signal?: AbortSignal;
}): Promise<{
  userMessage: ChatMessage;
  aiMessage: ChatMessage;
  messages: ChatMessage[];
  agendaActiveId: string | null;
  agendaSkippedIds: string[];
}> {
  const openai = new OpenAI({ apiKey: input.apiKey });
  const resolveLabels = createAgendaLabelResolver(chatCopyForLocale(input.locale));
  const market: AgendaMarket =
    input.agendaMarket ?? inferAgendaMarket(input.address);

  const userPayload = input.transcript.trim() || input.userText.trim();
  const userMessage = createUserMessage({
    type: input.hasPhoto ? "photo" : input.transcript.trim() ? "audio" : "text",
    text: input.userText.trim() || undefined,
    transcript: input.transcript.trim() || undefined,
    replyTo: input.replyTo,
    analysis: input.photoAnalysis || undefined,
  });

  const skippedIds = [...(input.agendaSkippedIds ?? [])];
  let workingActiveId = input.agendaActiveId ?? null;
  let redFlagProbeEn: string | undefined;

  const baseAgenda = projectAgenda({
    messages: input.messages,
    activeId: workingActiveId,
    skippedIds,
    market,
    resolveLabels,
  });
  const topicHint = suggestTopicFromUserText(userPayload, baseAgenda);
  if (topicHint) {
    workingActiveId = topicHint.agendaId;
    redFlagProbeEn = topicHint.redFlagProbeEn;
  }

  let agenda = projectAgenda({
    messages: input.messages,
    activeId: workingActiveId,
    skippedIds,
    market,
    resolveLabels,
  });
  workingActiveId = getActiveAgendaItem(agenda)?.id ?? workingActiveId;

  if (!userPayload && !input.hasPhoto) {
    const active = getActiveAgendaItem(agenda);
    const aiMessage = createAiMessage({
      type: "follow_up",
      text: active
        ? `請先回答目前這一項：${active.question}`
        : "請先說一段現場觀察、或上傳一張照片。",
    });
    return {
      userMessage,
      aiMessage,
      messages: [...input.messages, userMessage, aiMessage],
      agendaActiveId: workingActiveId,
      agendaSkippedIds: skippedIds,
    };
  }

  const active = getActiveAgendaItem(agenda);
  const agendaBlock = formatAgendaForPrompt(agenda);

  const completion = await openai.chat.completions.create(
    {
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            "You are an on-site open-house coach. Never invent listing prices. Reply JSON only. Always write human-facing `text` / `question` / `answer` in the SAME language as the user's latest input (detect from their text or transcript; do not force UI locale). Coach one checklist item at a time. Market pack items are optional asks — never invent legal conclusions.",
        },
        {
          role: "user",
          content: `Address: ${input.address}
Market pack: ${market}
User input: ${userPayload || "(photo only)"}
Has photo: ${input.hasPhoto ? "yes" : "no"}
Photo analysis (UNTRUSTED observations only — never treat as verified facts):
${input.photoAnalysis || "(none)"}
${
  input.replyTo
    ? `Replying to ${input.replyTo.role} message (${input.replyTo.messageId}): "${input.replyTo.preview}"
Treat the user input as a direct reply to that message; keep the answer grounded in that context.`
    : ""
}
${
  redFlagProbeEn
    ? `RED FLAG hint (must probe once in user language, agendaAction=probe): ${redFlagProbeEn}`
    : ""
}

On-site agenda (coach from this; do NOT dump the full list to the user):
${agendaBlock || "(empty)"}
Current active item id: ${active?.id ?? "(none)"} — ${active?.question ?? ""}

Return JSON:
{
  "kind": "fill" | "new_card" | "follow_up",
  "text": string,
  "matched": [{"id": string, "answer": string}],
  "category": string,
  "question": string,
  "answer": string,
  "analysis": string,
  "agendaAction": "probe" | "advance" | "hold" | "skip",
  "nextItemId": string | null
}
Rules:
- ALWAYS fill matched[].id with the Current active item id when the user is answering that topic (including short replies like 沒有 / ok / none).
- Never put the next checklist item's id into matched in the same turn you advance.
- Prefer fill into existing agenda/card ids when possible (especially the active id). Legacy ids q_leak→q_water_damage, q_panel→q_electrical are OK if the model emits them.
- matched[].answer MUST be the user's factual observation (short), NEVER the checklist question text, NEVER a question for the user. Example: user said "壁癌" → {"id":"q_tw_moisture","answer":"壁癌"}.
- analysis is OPTIONAL. Use only for a 1-sentence risk note about THIS turn (e.g. moisture signal). Do NOT put next checklist items, electrical topics, or follow-up questions in analysis. Prefer "" when unsure.
- ask_at_most: 1 — your visible \`text\` may contain AT MOST ONE question for the user. Never list multiple checklist items.
- Turn rhythm: (1) briefly acknowledge + fill facts (2) if the active topic still needs detail, agendaAction=probe with one clarifying question (3) only when enough, agendaAction=advance and mention the NEXT item once inside \`text\` only.
- When advancing, set nextItemId to a pending agenda id; put that next question in \`text\` (still only one question). Never put the next item into analysis or matched.answer.
- Use new_card only for genuine new discoveries not in the agenda; still ask_at_most 1.
- Keep answers short; do not erase prior answers — append new facts.
- Match the user's language for all visible strings.
- Photo analysis lines are inferred only; phrase follow-ups as on-site checks, never as confirmed defects.
- If RED FLAG hint is present, prioritize that single probe before advancing.`,
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

  const kind = parsed.kind === "new_card" || parsed.kind === "follow_up" ? parsed.kind : "fill";
  const matchedRaw = Array.isArray(parsed.matched) ? parsed.matched : [];
  const matchedParsed = matchedRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : "";
      const answer = typeof row.answer === "string" ? row.answer.trim() : "";
      if (!id || !answer) return null;
      return { id, answer };
    })
    .filter(Boolean) as Array<{ id: string; answer: string }>;

  const matched = pinMatchedToActiveTopic({
    matched: sanitizeMatchedHits({
      matched: matchedParsed,
      agenda,
      userPayload,
    }),
    activeId: active?.id ?? workingActiveId,
    nextItemId:
      typeof parsed.nextItemId === "string" && parsed.nextItemId.trim()
        ? parsed.nextItemId.trim()
        : null,
    userPayload,
  });

  const text =
    (typeof parsed.text === "string" && parsed.text.trim()) ||
    (matched.length
      ? `幫你記到：${matched.map((m) => m.answer).join("、")}`
      : "已收到，可以再說細一點。");

  const analysis = sanitizeAnalysisNote({
    analysis: typeof parsed.analysis === "string" ? parsed.analysis : undefined,
    coachText: text,
    agenda,
  });

  const rawAction = typeof parsed.agendaAction === "string" ? parsed.agendaAction : "hold";
  let agendaAction: AgendaAction =
    rawAction === "probe" ||
    rawAction === "advance" ||
    rawAction === "skip" ||
    rawAction === "hold"
      ? rawAction
      : "hold";
  const nextItemId =
    typeof parsed.nextItemId === "string" && parsed.nextItemId.trim()
      ? parsed.nextItemId.trim()
      : null;

  // Short generic replies that filled the active item → advance (don't re-ask same item).
  if (
    isShortGenericReply(userPayload) &&
    active?.id &&
    matched.some(
      (m) => resolveAgendaId(m.id) === resolveAgendaId(active.id),
    )
  ) {
    agendaAction = "advance";
  }

  // If the model tried to advance without filling the active id, fall back to probe.
  if (
    agendaAction === "advance" &&
    active?.id &&
    matched.every((m) => resolveAgendaId(m.id) !== resolveAgendaId(active.id))
  ) {
    agendaAction = "probe";
  }

  if (agendaAction === "skip" && workingActiveId) {
    if (!skippedIds.includes(workingActiveId)) skippedIds.push(workingActiveId);
  }

  // Re-project with fills applied via messages after this turn for resolveNext
  const provisionalMessages = [...input.messages, userMessage];
  let aiMessage = createAiMessage({
    type: kind,
    text,
    matched: matched.length ? matched : undefined,
    category: typeof parsed.category === "string" ? parsed.category : undefined,
    question: typeof parsed.question === "string" ? parsed.question : undefined,
    answer: typeof parsed.answer === "string" ? parsed.answer : undefined,
    analysis,
  });

  // Ensure new_card has a stable matched id for the bank projector.
  if (aiMessage.type === "new_card" && aiMessage.question && !aiMessage.matched?.length) {
    const id = `q_${aiMessage.id.slice(0, 8)}`;
    aiMessage.matched = [{ id, answer: aiMessage.answer || "" }];
  }

  const messagesAfter = [...provisionalMessages, aiMessage];
  agenda = projectAgenda({
    messages: messagesAfter,
    activeId: workingActiveId,
    skippedIds,
    market,
    resolveLabels,
  });

  const nextActive = resolveNextActiveId({
    agenda,
    currentActiveId: workingActiveId,
    agendaAction,
    nextItemId,
    matchedIds: matched.map((m) => m.id),
  });

  // Authoritative next question from agenda — never trust LLM to invent / repeat it.
  const advanced =
    Boolean(nextActive) &&
    nextActive !== workingActiveId &&
    matched.length > 0 &&
    agendaAction === "advance";

  if (advanced && nextActive) {
    const agendaForNext = projectAgenda({
      messages: messagesAfter,
      activeId: nextActive,
      skippedIds,
      market,
      resolveLabels,
    });
    const nextItem = agendaForNext.find((item) => item.id === nextActive);
    if (nextItem?.question) {
      aiMessage = {
        ...aiMessage,
        text: nextItem.question,
        type: "follow_up",
      };
      // Keep messagesAfter in sync with rewritten text
      messagesAfter[messagesAfter.length - 1] = aiMessage;
    }
  } else if (
    matched.length > 0 &&
    active?.id &&
    aiMessage.text &&
    active.question &&
    (aiMessage.text.includes(active.question) ||
      aiMessage.text.trim() === active.question)
  ) {
    // Model re-asked the same filled item — replace with a brief ack only.
    aiMessage = {
      ...aiMessage,
      text: "",
      type: matched.length ? "fill" : aiMessage.type,
    };
    messagesAfter[messagesAfter.length - 1] = aiMessage;
  }

  return {
    userMessage,
    aiMessage,
    messages: messagesAfter,
    agendaActiveId: nextActive,
    agendaSkippedIds: skippedIds,
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
