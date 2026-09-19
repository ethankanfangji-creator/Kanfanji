import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  aiTimeoutMs,
  assertContentLength,
  authorizeAiRequest,
  validateVisionBody,
} from "@/lib/ai-boundary/server-entry";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const input = validateVisionBody(await request.json());
    const boundary = await authorizeAiRequest(request, input);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AiInputError("ai_unavailable", 503);
    const { tag, locale, base64, mime, mediaId } = input;

    const languageHint =
      locale.startsWith("th")
        ? "ภาษาไทย only, sharp"
        : locale.startsWith("en")
          ? "English only, sharp"
          : locale.includes("Hans") || locale.toLowerCase().includes("cn")
            ? "简体中文，尖锐"
            : "繁體中文，尖銳";

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 120,
        messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a BC home inspector. Looking at this "${tag}" photo, what risk do you see? Reply with ONLY one must-ask open-house question. ${languageHint}.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mime};base64,${base64}`,
                detail: "low",
              },
            },
          ],
        },
        ],
      },
      { signal: AbortSignal.timeout(aiTimeoutMs()) },
    );

    const question = (completion.choices[0]?.message?.content || "")
      .trim()
      .replace(/^["「『]|["」』]$/g, "")
      .replace(/^\d+[\.\、\)]\s*/, "")
      .split("\n")[0]
      ?.trim();

    if (!question) {
      throw new AiInputError("ai_empty_response", 422);
    }

    return boundary.applyCookie(NextResponse.json({ question, tag, jobId: mediaId }));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
