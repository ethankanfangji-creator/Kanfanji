/**
 * Vision structured extract for property screenshots / condition photos.
 * Observations + slots are always inferred — never presented as verified facts.
 */

import OpenAI from "openai";
import { aiTimeoutMs } from "@/lib/ai-boundary/server-entry";
import { fenceUntrusted } from "@/lib/security/untrusted-content";
import {
  parseVisionExtractRaw,
  type VisionExtractParsed,
} from "@/lib/viewing-chat/collection/vision-slots";

export type VisionPropertyExtract = {
  extractedText: string;
  observedConditions: string[];
  uncertainItems: string[];
  confidence: number;
  slots: VisionExtractParsed["slots"];
};

export function isVisionApiConfigured(apiKey?: string): boolean {
  return Boolean(apiKey ?? process.env.OPENAI_API_KEY);
}

function normalizeImageMime(mime: string): string {
  const m = mime.toLowerCase().trim();
  if (m === "image/jpg") return "image/jpeg";
  return m || "image/jpeg";
}

export async function extractPropertyFromImage(args: {
  base64: string;
  mime: string;
  locale: string;
  apiKey?: string;
}): Promise<VisionPropertyExtract | null> {
  const apiKey = args.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const mime = normalizeImageMime(args.mime);
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    return null;
  }

  const languageHint = args.locale.startsWith("th")
    ? "Thai"
    : args.locale.startsWith("en")
      ? "English"
      : args.locale.includes("Hans")
        ? "Simplified Chinese"
        : "Traditional Chinese";

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 1400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You extract listing OCR text, condition observations, and optional equipment slots from property photos.
Return JSON only:
{
  "extractedText": string,
  "observedConditions": string[],
  "uncertainItems": string[],
  "confidence": number,
  "slots": [{ "fieldId": string, "value": string, "confidence": number, "note": string }]
}
Rules:
- Language: ${languageHint}
- Prefer copying visible listing text into extractedText when this is a screenshot
- Do NOT invent listing facts not visible in the image
- slots.fieldId limited to: electrical, plumbing, hvac, water_damage, odor, light, amenities, layout, noise, parking, floor
- Example: electrical panel labeled "Federal Pioneer" → slot { fieldId: "electrical", value: "Federal Pioneer", confidence: 0.7, note: "panel label visible" }
- If brand/text is unclear, put in uncertainItems — do not guess brand names
- Phrase conditions as suspected observations needing on-site check
- Never claim verified leaks/faults from a photo alone
- Never infer race, gender, age, wealth, or other sensitive traits of people
- confidence is 0..1 for OCR/observation quality`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this property listing screenshot or interior/exterior photo. OCR any visible listing text carefully. If you see an electrical panel or equipment label, add a slot.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mime};base64,${args.base64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
      },
      { signal: AbortSignal.timeout(aiTimeoutMs()) },
    );

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;
    const { parsed, ok } = parseVisionExtractRaw(raw);
    if (!ok || !parsed) return null;

    void fenceUntrusted(parsed.extractedText, {
      kind: "document",
      sourceUrl: null,
      licenseHint: "user_upload_vision_ocr",
    });

    return {
      extractedText: parsed.extractedText.slice(0, 8_000),
      observedConditions: parsed.observedConditions
        .map((s) => s.slice(0, 300))
        .slice(0, 12),
      uncertainItems: parsed.uncertainItems.map((s) => s.slice(0, 300)).slice(0, 12),
      confidence: parsed.confidence,
      slots: (parsed.slots ?? []).slice(0, 12),
    };
  } catch {
    return null;
  }
}
