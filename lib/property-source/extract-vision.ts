/**
 * Vision structured extract for property screenshots / condition photos.
 * Observations are always inferred — never presented as verified facts.
 */

import OpenAI from "openai";
import { aiTimeoutMs } from "@/lib/ai-boundary/server-entry";
import { fenceUntrusted } from "@/lib/security/untrusted-content";

export type VisionPropertyExtract = {
  extractedText: string;
  observedConditions: string[];
  uncertainItems: string[];
  confidence: number;
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
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You extract listing OCR text and condition observations from property photos/screenshots.
Return JSON only:
{
  "extractedText": string,
  "observedConditions": string[],
  "uncertainItems": string[],
  "confidence": number
}
Rules:
- Language: ${languageHint}
- Prefer copying visible listing text into extractedText (price, beds, baths, area, fees, address snippets) when this is a screenshot
- Do NOT invent listing facts not visible in the image
- If almost no readable text, set extractedText to "" and list uncertainItems
- Phrase conditions as suspected observations needing on-site check (e.g. "ceiling may show water stains — confirm leak/repair history")
- Never claim "roof is leaking" as fact from a photo
- Never infer race, gender, age, wealth, or other sensitive traits of people
- Avoid discriminatory school/crime/neighborhood stereotypes
- confidence is 0..1 for OCR/observation quality`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this property listing screenshot or interior/exterior photo. OCR any visible listing text carefully.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mime};base64,${args.base64}`,
                  // "low" is too lossy for dense listing screenshots / OCR.
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
    const parsed = JSON.parse(raw) as Partial<VisionPropertyExtract>;
    const extractedText = String(parsed.extractedText ?? "").slice(0, 8_000);
    const observedConditions = Array.isArray(parsed.observedConditions)
      ? parsed.observedConditions.map((s) => String(s).slice(0, 300)).slice(0, 12)
      : [];
    const uncertainItems = Array.isArray(parsed.uncertainItems)
      ? parsed.uncertainItems.map((s) => String(s).slice(0, 300)).slice(0, 12)
      : [];
    const confidence = Math.max(
      0,
      Math.min(1, Number(parsed.confidence) || 0.4),
    );
    void fenceUntrusted(extractedText, {
      kind: "document",
      sourceUrl: null,
      licenseHint: "user_upload_vision_ocr",
    });
    return { extractedText, observedConditions, uncertainItems, confidence };
  } catch {
    return null;
  }
}
