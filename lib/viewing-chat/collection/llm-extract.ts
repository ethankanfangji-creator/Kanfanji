/**
 * Implicit (B) upgrade — optional LLM extract alongside rule-based extract.
 * Zod-validated; on failure keep rules only + raw response (no overwrite).
 */

import OpenAI from "openai";
import { z } from "zod";
import { VIEWING_RECORDER_SYSTEM_PROMPT } from "./llm-prompt";
import { parseLlmJson } from "./llm-schemas";
import type { ExtractedPropertyFact, PropertyFieldId } from "./types";

export const LlmExtractedFactSchema = z.object({
  fieldId: z.string().min(1).max(40),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  status: z.enum(["confirmed", "inferred", "unknown", "corrected"]),
  confidence: z.number().min(0).max(1),
  rawText: z.string().min(1).max(500),
});

export const LlmExtractSchema = z.object({
  fields: z.array(LlmExtractedFactSchema).max(20),
});

const ALLOWED: Set<string> = new Set([
  "address",
  "price",
  "area",
  "layout",
  "floor",
  "noise",
  "transit",
  "pros",
  "cons",
  "odor",
  "light",
  "water_damage",
  "electrical",
  "plumbing",
  "hvac",
  "parking",
  "amenities",
  "year_built",
]);

export type LlmExtractResult = {
  fields: ExtractedPropertyFact[];
  warning?: string;
  rawAiResponse?: string;
};

export async function extractPropertyFactsWithLlm(input: {
  apiKey?: string;
  text: string;
  messageId: string | null;
  signal?: AbortSignal;
}): Promise<LlmExtractResult> {
  if (!input.apiKey || !input.text.trim() || input.text.trim().length < 4) {
    return { fields: [] };
  }

  try {
    const openai = new OpenAI({ apiKey: input.apiKey });
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        max_tokens: 900,
        messages: [
          {
            role: "system",
            content: `${VIEWING_RECORDER_SYSTEM_PROMPT}

本呼叫只做欄位抽取。回覆 JSON：
{ "fields": [{ "fieldId", "value", "status", "confidence", "rawText" }] }
- fieldId 限：address,price,area,layout,floor,noise,transit,pros,cons,odor,light,water_damage,electrical,plumbing,hvac,parking,amenities,year_built
- 只使用使用者原文有根據的資訊；模糊保留原文並標 inferred 或 unknown
- 不可自行補精確數字；不可把推測當 confirmed
- 沒有可抽欄位時回 { "fields": [] }`,
          },
          {
            role: "user",
            content: input.text.slice(0, 3000),
          },
        ],
      },
      { signal: input.signal ?? AbortSignal.timeout(20_000) },
    );

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    const parsed = parseLlmJson(raw, LlmExtractSchema);
    if (!parsed.ok) {
      return {
        fields: [],
        warning: "extraction_failed",
        rawAiResponse: parsed.raw,
      };
    }

    const fields: ExtractedPropertyFact[] = [];
    for (const row of parsed.data.fields) {
      if (!ALLOWED.has(row.fieldId)) continue;
      // LLM must not invent confirmed numeric listing facts without digits in rawText
      if (
        row.status === "confirmed" &&
        (row.fieldId === "price" || row.fieldId === "area" || row.fieldId === "year_built") &&
        typeof row.value === "number" &&
        !/\d/.test(row.rawText)
      ) {
        continue;
      }
      fields.push({
        fieldId: row.fieldId as PropertyFieldId,
        value: row.value,
        status: row.status === "corrected" ? "corrected" : row.status,
        confidence: Math.min(0.9, row.confidence),
        sourceMessageId: input.messageId,
        rawText: row.rawText,
      });
    }
    return { fields, rawAiResponse: parsed.raw };
  } catch {
    return { fields: [], warning: "llm_failed" };
  }
}

/**
 * Merge rule facts with LLM facts: rules win on same fieldId when both present;
 * LLM only fills gaps (or upgrades unknown).
 */
export function mergeRuleAndLlmFacts(
  ruleFacts: ExtractedPropertyFact[],
  llmFacts: ExtractedPropertyFact[],
): ExtractedPropertyFact[] {
  const byId = new Map<string, ExtractedPropertyFact>();
  for (const f of ruleFacts) byId.set(f.fieldId, f);
  for (const f of llmFacts) {
    const prev = byId.get(f.fieldId);
    if (!prev) {
      byId.set(f.fieldId, f);
      continue;
    }
    if (prev.status === "unknown" && f.status !== "unknown") {
      byId.set(f.fieldId, f);
    }
  }
  return [...byId.values()];
}
