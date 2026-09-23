/**
 * Contextual (C) — photo vision → inferred slot candidates.
 * Zod-validated; failures return empty (never invent confirmed facts).
 */

import { z } from "zod";
import { parseLlmJson } from "./llm-schemas";
import type { ExtractedPropertyFact, PropertyFieldId } from "./types";

export const VisionSlotSchema = z.object({
  fieldId: z.string().min(1).max(40),
  value: z.string().min(1).max(200),
  confidence: z.number().min(0).max(1).optional(),
  note: z.string().max(300).optional(),
});

export const VisionExtractSchema = z.object({
  extractedText: z.string().max(4000).optional().default(""),
  observedConditions: z.array(z.string().max(300)).max(20).optional().default([]),
  uncertainItems: z.array(z.string().max(300)).max(20).optional().default([]),
  confidence: z.number().min(0).max(1).optional().default(0.4),
  /** Structured slot guesses from the image — always treated as inferred */
  slots: z.array(VisionSlotSchema).max(12).optional().default([]),
});

export type VisionExtractParsed = z.infer<typeof VisionExtractSchema>;

const ALLOWED_VISION_FIELDS = new Set<string>([
  "electrical",
  "plumbing",
  "hvac",
  "water_damage",
  "odor",
  "light",
  "amenities",
  "layout",
  "noise",
  "parking",
  "floor",
]);

export function visionSlotsToInferredFacts(
  parsed: VisionExtractParsed,
  messageId: string | null,
): ExtractedPropertyFact[] {
  const facts: ExtractedPropertyFact[] = [];

  for (const slot of parsed.slots ?? []) {
    if (!ALLOWED_VISION_FIELDS.has(slot.fieldId)) continue;
    const conf = Math.min(0.75, Math.max(0.25, slot.confidence ?? parsed.confidence ?? 0.45));
    facts.push({
      fieldId: slot.fieldId as PropertyFieldId,
      value: slot.value.trim(),
      status: "inferred",
      confidence: conf,
      sourceMessageId: messageId,
      rawText: slot.note
        ? `${slot.value}（照片辨識：${slot.note}）`
        : `${slot.value}（照片辨識）`,
    });
  }

  // Soft odor / water cues from freeform observations when no slot
  for (const obs of parsed.observedConditions ?? []) {
    if (/霉|musty|mold|臭/i.test(obs) && !facts.some((f) => f.fieldId === "odor")) {
      facts.push({
        fieldId: "odor",
        value: obs.slice(0, 120),
        status: "inferred",
        confidence: 0.35,
        sourceMessageId: messageId,
        rawText: obs,
      });
    }
    if (
      /水漬|漏水|壁癌|water\s*stain|leak/i.test(obs) &&
      !facts.some((f) => f.fieldId === "water_damage")
    ) {
      facts.push({
        fieldId: "water_damage",
        value: obs.slice(0, 120),
        status: "inferred",
        confidence: 0.35,
        sourceMessageId: messageId,
        rawText: obs,
      });
    }
  }

  return facts;
}

export function parseVisionExtractRaw(raw: string): {
  parsed: VisionExtractParsed | null;
  raw: string;
  ok: boolean;
} {
  const result = parseLlmJson(raw, VisionExtractSchema);
  if (!result.ok) {
    return { parsed: null, raw: result.raw, ok: false };
  }
  return { parsed: result.data, raw: result.raw, ok: true };
}
