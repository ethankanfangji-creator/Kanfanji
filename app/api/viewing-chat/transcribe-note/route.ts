import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  assertContentLength,
  authorizeAiRequest,
  validateConsent,
} from "@/lib/ai-boundary/server-entry";

export const runtime = "nodejs";

/** Whisper-only helper for note capture — no SOP / field fill. */
export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const form = await request.formData();
    const consent = validateConsent((key) => {
      const value = form.get(key);
      return typeof value === "string" ? value : null;
    });
    const boundary = await authorizeAiRequest(request, consent);
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size < 1) {
      throw new AiInputError("audio_invalid", 400);
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AiInputError("ai_unavailable", 503);
    const openai = new OpenAI({ apiKey });
    const transcription = await openai.audio.transcriptions.create(
      {
        file: audio,
        model: "whisper-1",
        language: "zh",
      },
      { signal: AbortSignal.timeout(45_000) },
    );
    const transcript = (transcription.text || "").trim();
    return boundary.applyCookie(NextResponse.json({ transcript }));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
