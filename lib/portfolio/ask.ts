import OpenAI from "openai";
import { z } from "zod";
import { parseLlmJson } from "@/lib/viewing-chat/collection/llm-schemas";
import {
  formatHistoryForPrompt,
  rewriteHintInstruction,
  type PortfolioHistoryTurn,
  type PortfolioRewriteHint,
} from "./context";
import { formatCorpusForPrompt } from "./corpus";
import type { PortfolioAskResult, PortfolioFactCard } from "./types";

const PortfolioAskLlmSchema = z.object({
  answer: z.string().min(1).max(6000),
  matchedIds: z.array(z.string()).max(40).optional(),
  citations: z
    .array(
      z.object({
        viewingId: z.string(),
        excerpt: z.string().max(400),
      }),
    )
    .max(20)
    .optional(),
  suggestCompare: z.boolean().optional(),
});

function localeInstruction(locale: string): string {
  if (locale.startsWith("zh")) {
    return "用繁體中文回答（若使用者用簡體則可用簡體）。";
  }
  if (locale.startsWith("th")) return "Answer in Thai.";
  return "Answer in the same language as the user question (default English).";
}

export async function askPortfolio(input: {
  apiKey: string;
  question: string;
  cards: PortfolioFactCard[];
  locale: string;
  history?: PortfolioHistoryTurn[];
  rewriteHint?: PortfolioRewriteHint | null;
  preferenceBlock?: string | null;
  signal?: AbortSignal;
}): Promise<PortfolioAskResult> {
  const question = input.question.trim().slice(0, 2000);
  if (!question) {
    return {
      answer: "請先輸入問題。",
      matchedIds: [],
      citations: [],
      suggestCompare: false,
    };
  }
  if (input.cards.length === 0) {
    return {
      answer: "目前範圍內沒有看房記錄。請先記錄幾間，或放寬範圍後再問。",
      matchedIds: [],
      citations: [],
      suggestCompare: false,
    };
  }

  const allowIds = new Set(input.cards.map((card) => card.id));
  const corpus = formatCorpusForPrompt(input.cards);
  const historyBlock = formatHistoryForPrompt(input.history ?? []);
  const rewriteBlock = input.rewriteHint
    ? rewriteHintInstruction(input.rewriteHint)
    : "";
  const prefs = input.preferenceBlock?.trim() || "";
  const openai = new OpenAI({ apiKey: input.apiKey });

  const completion = await openai.chat.completions.create(
    {
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      max_tokens: 1600,
      messages: [
        {
          role: "system",
          content: `你是看房記的整理助理。使用者會問關於「他自己看過的多間房子」的問題。
只根據 HOMES 語料回答；禁止用外部行情、地圖或常識補造價格、屋況、法規事實。
筆記／欄位沒寫到的硬事實（價格、屋況、法規），明確說「筆記未提到」，不要猜測。
tags 是房主對該套房的看法／小定論（可跨房重複，例如「太吵」「備選」「適合長輩」）：
- 問「哪些備選／太吵／我標過…」時，優先用 tags 歸類與篩選。
- tags 不是價格／屋況硬事實；硬事實仍以筆記／欄位為準。若看法類問題只在 tags 有答案，可直接依 tags 回答。
- 內建 id liked/shortlist/passed/revisit 等同「喜歡／候補／已排除／再看」這類決策標籤。
EXTERNAL_COMMENTS 是分享連結上的訪客／家人留言（暱稱如「媽媽」），不是房主現場筆記：
- 問「誰比較喜歡／媽媽感覺／家人意見」時，優先看 EXTERNAL_COMMENTS 的暱稱與內容。
- 留言不得覆蓋筆記／報告裡的硬事實；若留言與筆記衝突，以筆記為準並分開說明。
- 相關偏好在留言裡找不到時，明說「分享留言未提到」。
citations 可引用留言短句，並可帶暱稱（例如「媽媽：…」）；也可引用 tags。
預算等數字條件：只有語料裡有可解析價格的房子才能納入符合清單；有提到但無法比價的要另外說明。
matchedIds 只能使用 HOMES 裡出現的 id。
若問題是在比較差異且 matchedIds 有 2–5 間，suggestCompare 可為 true，否則 false。
citations 的 excerpt 必須是語料裡的短句或改寫緊貼原文。
若有 PRIOR_TURNS，把它當成同一段對話：代詞（這幾間／剛才／那些）指向先前 matched 或討論過的房子。
${localeInstruction(input.locale)}`,
        },
        {
          role: "user",
          content: [
            historyBlock,
            rewriteBlock,
            prefs,
            `QUESTION:\n${question}`,
            `HOMES:\n${corpus}`,
            `Return JSON:
{
  "answer": string,
  "matchedIds": string[],
  "citations": [{"viewingId": string, "excerpt": string}],
  "suggestCompare": boolean
}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    },
    { signal: input.signal ?? AbortSignal.timeout(60_000) },
  );

  const raw = completion.choices[0]?.message?.content?.trim() || "{}";
  const parsed = parseLlmJson(raw, PortfolioAskLlmSchema);
  if (!parsed.ok) {
    return {
      answer: "整理暫時失敗，請再試一次。你的看房記錄仍保留在裝置上。",
      matchedIds: [],
      citations: [],
      suggestCompare: false,
    };
  }

  const matchedIds = (parsed.data.matchedIds ?? []).filter((id) => allowIds.has(id));
  const citations = (parsed.data.citations ?? [])
    .filter((row) => allowIds.has(row.viewingId) && row.excerpt.trim())
    .map((row) => ({
      viewingId: row.viewingId,
      excerpt: row.excerpt.trim().slice(0, 280),
    }))
    .slice(0, 12);

  const suggestCompare =
    Boolean(parsed.data.suggestCompare) && matchedIds.length >= 2 && matchedIds.length <= 5;

  return {
    answer: parsed.data.answer.trim(),
    matchedIds,
    citations,
    suggestCompare,
  };
}
