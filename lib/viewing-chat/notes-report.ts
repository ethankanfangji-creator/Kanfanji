import OpenAI from "openai";
import { viewingRecorderReportRules } from "@/lib/viewing-chat/collection";
import {
  ChatReportLlmSchema,
  parseLlmJson,
} from "@/lib/viewing-chat/collection/llm-schemas";
import { notesFingerprint, userNotesOnly } from "@/lib/viewing-chat/briefing";
import {
  createAiMessage,
  DEFAULT_QUESTION_BANK,
  type ChatMessage,
  type ChatReportSnapshot,
} from "@/lib/viewing-chat/types";

function notesTranscript(messages: ChatMessage[]): string {
  return userNotesOnly(messages)
    .map((message) => {
      const body =
        message.transcript?.trim() ||
        message.text?.trim() ||
        (message.type === "photo" ? "(照片筆記)" : "") ||
        (message.type === "audio" ? "(語音筆記)" : "") ||
        (message.type === "file" ? `(檔案：${message.fileName || "file"})` : "") ||
        "";
      return `- ${body}`;
    })
    .filter((line) => line !== "- ")
    .join("\n")
    .slice(0, 12_000);
}

/** Report built only from user notes — no listing facts, no SOP fields. */
export async function buildNotesOnlyReport(input: {
  apiKey: string;
  address: string;
  locale: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}): Promise<{
  report: ChatReportSnapshot;
  aiMessage: ChatMessage;
  extractionStatus: "ok" | "extraction_failed";
}> {
  const fingerprint = notesFingerprint(input.messages);
  const notes = notesTranscript(input.messages);
  const openai = new OpenAI({ apiKey: input.apiKey });

  if (!notes.trim()) {
    const report: ChatReportSnapshot = {
      pros: [],
      risks: [],
      checklist: DEFAULT_QUESTION_BANK.map((item) => ({
        id: item.id,
        question: item.question,
        answer: "未看",
        status: "unknown" as const,
      })),
      summary: "這則還沒有筆記。報告只能寫筆記裡有的內容。",
      generatedAt: new Date().toISOString(),
      notesFingerprint: fingerprint,
    };
    return {
      report,
      aiMessage: createAiMessage({ type: "report", text: report.summary, report }),
      extractionStatus: "ok",
    };
  }

  const completion = await openai.chat.completions.create(
    {
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content: `${viewingRecorderReportRules(input.locale)}

只根據 USER_NOTES。不要用外部行情、房源頁或推測補內容。
筆記沒提過的 checklist 項目 status 必須是 unknown，answer 寫「未看」。
否定詞不可翻轉：「不吵」不可變成吵。`,
        },
        {
          role: "user",
          content: `Address: ${input.address}

USER_NOTES:
${notes}

Return JSON:
{
  "pros": string[],
  "risks": string[],
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
    const report: ChatReportSnapshot = {
      pros: [],
      risks: [],
      checklist: DEFAULT_QUESTION_BANK.map((item) => ({
        id: item.id,
        question: item.question,
        answer: "未看",
        status: "unknown" as const,
      })),
      summary: "報告整理暫時失敗。筆記仍保留，請再按一次生成報告。",
      generatedAt: new Date().toISOString(),
      notesFingerprint: fingerprint,
    };
    return {
      report,
      aiMessage: createAiMessage({
        type: "report",
        text: report.summary,
        report,
        analysis: "extraction_failed",
      }),
      extractionStatus: "extraction_failed",
    };
  }

  const parsed = llmParsed.data;
  const checklist =
    (parsed.checklist?.length ? parsed.checklist : DEFAULT_QUESTION_BANK.map((item) => ({
      id: item.id,
      question: item.question,
      answer: "未看",
      status: "unknown" as const,
    }))).map((row, index) => ({
      id: row.id || `c_${index}`,
      question: row.question,
      answer: row.status === "unknown" && !row.answer?.trim() ? "未看" : row.answer || "未看",
      status: row.status,
    }));

  const report: ChatReportSnapshot = {
    pros: (parsed.pros ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 5),
    risks: (parsed.risks ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 5),
    checklist,
    summary: parsed.summary?.trim() || "報告已依筆記整理。",
    generatedAt: new Date().toISOString(),
    notesFingerprint: fingerprint,
  };

  return {
    report,
    aiMessage: createAiMessage({
      type: "report",
      text: report.summary,
      report,
    }),
    extractionStatus: "ok",
  };
}
