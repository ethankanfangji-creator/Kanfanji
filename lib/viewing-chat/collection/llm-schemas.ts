/**
 * Zod schemas for viewing-chat LLM outputs.
 * Parse failures must never overwrite prior good collection data —
 * keep raw response, mark extraction_failed, allow retry.
 */

import { z } from "zod";

export const PolishReplySchema = z.object({
  assistantMessage: z.string().min(1).max(4000),
});

export const ChatReportLlmSchema = z.object({
  pros: z.array(z.string()).max(8).optional(),
  risks: z.array(z.string()).max(8).optional(),
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
  summary: z.string().max(4000).optional(),
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
