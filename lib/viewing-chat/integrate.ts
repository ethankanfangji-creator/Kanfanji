import OpenAI from "openai";
import {
  createAiMessage,
  createUserMessage,
  DEFAULT_QUESTION_BANK,
  type ChatMessage,
  type ChatReportSnapshot,
} from "./types";
import { projectQuestionBank } from "./project-bank";

export async function integrateChatTurn(input: {
  apiKey: string;
  address: string;
  locale: string;
  messages: ChatMessage[];
  userText: string;
  transcript: string;
  hasPhoto: boolean;
  signal?: AbortSignal;
}): Promise<{ userMessage: ChatMessage; aiMessage: ChatMessage; messages: ChatMessage[] }> {
  const bank = projectQuestionBank(input.messages);
  const openai = new OpenAI({ apiKey: input.apiKey });

  const userPayload = input.transcript.trim() || input.userText.trim();
  const userMessage = createUserMessage({
    type: input.hasPhoto ? "photo" : input.transcript.trim() ? "audio" : "text",
    text: input.userText.trim() || undefined,
    transcript: input.transcript.trim() || undefined,
  });

  if (!userPayload && !input.hasPhoto) {
    const aiMessage = createAiMessage({
      type: "follow_up",
      text: "請先說一段現場觀察、或上傳一張照片。",
    });
    return {
      userMessage,
      aiMessage,
      messages: [...input.messages, userMessage, aiMessage],
    };
  }

  const bankLines = bank
    .map((item) => `- id:${item.id} [${item.category}] ${item.question}${item.answer ? ` | answer=${item.answer}` : ""}`)
    .join("\n");

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
            "You are an on-site open-house chat assistant. Never invent listing prices. Reply JSON only. Always write human-facing `text` / `question` / `answer` in the SAME language as the user's latest input (detect from their text or transcript; do not force UI locale). Ask clarifying questions in the chat itself.",
        },
        {
          role: "user",
          content: `Address: ${input.address}
User input: ${userPayload || "(photo only)"}
Has photo: ${input.hasPhoto ? "yes" : "no"}

Known cards (memory only, not a sidebar):
${bankLines || "(empty)"}

Return JSON:
{
  "kind": "fill" | "new_card" | "follow_up",
  "text": string,
  "matched": [{"id": string, "answer": string}],
  "category": string,
  "question": string,
  "answer": string,
  "analysis": string
}
Rules:
- Prefer fill into existing card ids when possible.
- When you discover something new, use kind=new_card and put the question in chat.
- Use follow_up to ask clarifying questions directly in chat text.
- Keep answers short; do not erase prior answers — append new facts.
- Match the user's language for all visible strings.`,
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
  const matched = matchedRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : "";
      const answer = typeof row.answer === "string" ? row.answer.trim() : "";
      if (!id || !answer) return null;
      return { id, answer };
    })
    .filter(Boolean) as Array<{ id: string; answer: string }>;

  const text =
    (typeof parsed.text === "string" && parsed.text.trim()) ||
    (matched.length
      ? `幫你記到：${matched.map((m) => m.answer).join("、")}`
      : "已收到，可以再說細一點。");

  const aiMessage = createAiMessage({
    type: kind,
    text,
    matched: matched.length ? matched : undefined,
    category: typeof parsed.category === "string" ? parsed.category : undefined,
    question: typeof parsed.question === "string" ? parsed.question : undefined,
    answer: typeof parsed.answer === "string" ? parsed.answer : undefined,
    analysis: typeof parsed.analysis === "string" ? parsed.analysis : undefined,
  });

  // Ensure new_card has a stable matched id for the bank projector.
  if (aiMessage.type === "new_card" && aiMessage.question && !aiMessage.matched?.length) {
    const id = `q_${aiMessage.id.slice(0, 8)}`;
    aiMessage.matched = [{ id, answer: aiMessage.answer || "" }];
  }

  return {
    userMessage,
    aiMessage,
    messages: [...input.messages, userMessage, aiMessage],
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
    ? JSON.stringify(
        {
          request: input.propertyReport.request,
          property: input.propertyReport.property,
          costs: input.propertyReport.costs,
          market: input.propertyReport.market,
          location: {
            schools: input.propertyReport.location.schools.slice(0, 5),
            transit: input.propertyReport.location.transit.slice(0, 5),
          },
          risks: input.propertyReport.risks,
          evidence: input.propertyReport.evidence
            .filter((e) => e.status === "found")
            .slice(0, 40)
            .map((e) => ({
              id: e.id,
              field: e.field,
              value: e.value,
              source_type: e.source_type,
              confidence: e.confidence,
            })),
          data_gaps: input.propertyReport.risks.data_gaps.slice(0, 30),
          disclaimer: input.propertyReport.disclaimer,
        },
        null,
        0,
      ).slice(0, 10_000)
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
- Any numeric or listing fact in the summary/pros/risks MUST cite an evidence id from PROPERTY_EVIDENCE (e.g. [ev_3_year_built]).
- If a field is in data_gaps or needs_human, say it is unconfirmed — never invent.
- Do not invent flood/earthquake/tax/HOA/price when evidence is missing.`,
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

  const report: ChatReportSnapshot = {
    pros: asStringList(parsed.pros, ["採光／格局待確認", "社區機能待確認", "現場感覺待補充"]),
    risks: asStringList(parsed.risks, ["屋況細節未足", "費用文件未核對", "噪音／鄰居未知"]),
    checklist:
      checklist.length > 0
        ? checklist
        : DEFAULT_QUESTION_BANK.map((item) => {
            const hit = bank.find((b) => b.id === item.id);
            return {
              id: item.id,
              question: item.question,
              answer: hit?.answer || "",
              status: (hit?.answer ? "ok" : "unknown") as "ok" | "unknown",
            };
          }),
    summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
    generatedAt: new Date().toISOString(),
  };

  const aiMessage = createAiMessage({
    type: "report",
    text: report.summary || "報告已生成，可分享連結。",
    report,
  });

  return { report, aiMessage };
}
