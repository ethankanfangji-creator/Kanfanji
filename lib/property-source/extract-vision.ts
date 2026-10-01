/**
 * Vision structured extract for property screenshots / condition photos.
 * Observations + slots are always inferred — never presented as verified facts.
 */

import OpenAI from "openai";
import { aiTimeoutMs } from "@/lib/ai-boundary/server-entry";
import { getVisionPrompt } from "@/lib/prompts/get-system-prompt";
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

  const languageLock = getVisionPrompt(args.locale);

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
            content: languageLock,
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
