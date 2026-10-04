/**
 * Zod schemas for viewing-chat LLM outputs.
 * Parse failures must never overwrite prior good collection data —
 * keep raw response, mark extraction_failed, allow retry.
 */

import { z } from "zod";

export const PolishReplySchema = z.object({
  assistantMessage: z.string().min(1).max(4000),
});

const nullableString = z.union([z.string().max(200), z.null()]).optional();

export const ChatReportMetaLlmSchema = z
  .object({
    viewingDate: nullableString,
    propertyType: nullableString,
    yearBuilt: nullableString,
    askingPrice: nullableString,
    lotSize: nullableString,
    interiorSize: nullableString,
    layout: nullableString,
    neighborhood: nullableString,
  })
  .optional();

export const ChatReportScoresLlmSchema = z
  .object({
    items: z
      .array(
        z.object({
          label: z.string().min(1).max(80),
          score: z.number().min(0).max(5),
        }),
      )
      .max(16)
      .optional(),
    overall: z.string().max(80).optional(),
    highlight: z.string().max(500).optional(),
    biggestQuestion: z.string().max(500).optional(),
  })
  .optional();

/** ChatGPT-style sectioned report (+ legacy fields still accepted for integrate path). */
export const ChatReportLlmSchema = z.object({
  title: z.string().max(300).optional(),
  meta: ChatReportMetaLlmSchema,
  overview: z.string().max(8000).optional(),
  interior: z.string().max(8000).optional(),
  outdoorLand: z.string().max(8000).optional(),
  transitLifestyle: z.string().max(8000).optional(),
  pricing: z.string().max(8000).optional(),
  pros: z.array(z.string()).max(24).optional(),
  risks: z.array(z.string()).max(24).optional(),
  scores: ChatReportScoresLlmSchema,
  verdict: z.string().max(8000).optional(),
  nextSteps: z.array(z.string()).max(24).optional(),
  /** @deprecated not in ChatGPT template — ignored by notes report path */
  whatsStoppingYou: z.array(z.string()).max(24).optional(),
  /** @deprecated legacy integrate / old prompts */
  followUps: z.array(z.string()).max(24).optional(),
  checklist: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        answer: z.string(),
        status: z.enum(["ok", "risk", "unknown"]),
      }),
    )
    .max(40)
    .optional(),
  summary: z.string().max(12000).optional(),
});

export type PolishReply = z.infer<typeof PolishReplySchema>;
export type ChatReportLlm = z.infer<typeof ChatReportLlmSchema>;

export type LlmParseResult<T> =
  | { ok: true; data: T; raw: string }
  | { ok: false; raw: string; error: string };

export function parseLlmJson<T>(
  raw: string,
  schema: z.ZodType<T>,
): LlmParseResult<T> {
  const trimmed = raw.trim();
  let json: unknown;
  try {
    json = JSON.parse(trimmed || "{}");
  } catch {
    return { ok: false, raw: trimmed, error: "json_parse_failed" };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      raw: trimmed,
      error: parsed.error.issues[0]?.message ?? "schema_invalid",
    };
  }
  return { ok: true, data: parsed.data, raw: trimmed };
}
