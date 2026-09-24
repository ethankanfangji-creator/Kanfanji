import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  aiOutputLanguageInstruction,
  aiTimeoutMs,
  assertContentLength,
  authorizeAiRequest,
  validateVisionBody,
} from "@/lib/ai-boundary/server-entry";
import { extractPropertyFromImage } from "@/lib/property-source/extract-vision";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const body = (await request.json()) as Record<string, unknown>;
    const input = validateVisionBody(body);
    const boundary = await authorizeAiRequest(request, input);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AiInputError("ai_unavailable", 503);
    const { tag, locale, base64, mime, mediaId } = input;
    const mode = typeof body.mode === "string" ? body.mode : "question";

    if (mode === "property_source") {
      const extracted = await extractPropertyFromImage({
        base64,
        mime,
        locale,
        apiKey,
      });
      if (!extracted) {
        throw new AiInputError("ai_empty_response", 422);
      }
      return boundary.applyCookie(
        NextResponse.json({
          mode: "property_source",
          ...extracted,
          tag,
          jobId: mediaId,
        }),
      );
    }

    const languageLock = aiOutputLanguageInstruction(locale);

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
                text: `You are a home inspector for US/CA/TW markets. Looking at this "${tag}" photo, what risk do you see? Reply with ONLY one must-ask open-house question. ${languageLock} Keep the question sharp and concise. Do not invent facts; phrase as a check question.`,
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
