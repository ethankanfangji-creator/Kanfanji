import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  AiInputError,
  aiErrorResponse,
  aiTimeoutMs,
  assertContentLength,
  authorizeAiRequest,
  validateConsent,
} from "@/lib/ai-boundary/server-entry";
import { AI_LIMITS } from "@/lib/ai-boundary/config";
import { integrateChatTurn } from "@/lib/viewing-chat/integrate";
import type { ChatMessage } from "@/lib/viewing-chat/types";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

function parseMessages(raw: FormDataEntryValue | null): ChatMessage[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const form = await request.formData();
    const consent = validateConsent((key) => form.get(key));
    const boundary = await authorizeAiRequest(request, consent);

    const address = String(form.get("address") ?? "").trim();
    if (!address || address.length > 500) throw new AiInputError("address_invalid");
    const locale = String(form.get("locale") ?? "zh-Hant");
    const viewingId = String(form.get("viewingId") ?? "").trim() || null;
    const text = String(form.get("text") ?? "").trim().slice(0, AI_LIMITS.genericString);
    const messages = parseMessages(form.get("messages")).slice(-80);
    const audio = form.get("audio");
    const image = form.get("image");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AiInputError("ai_unavailable", 503);

    let transcript = "";
    if (audio instanceof File && audio.size > 0) {
      if (audio.size > AI_LIMITS.audioBytes) throw new AiInputError("audio_too_large", 413);
      const openai = new OpenAI({ apiKey });
      const transcription = await openai.audio.transcriptions.create(
        {
          file: audio,
          model: "whisper-1",
        },
        { signal: AbortSignal.timeout(aiTimeoutMs()) },
      );
      transcript = transcription.text?.trim() || "";
    }

    const hasPhoto = image instanceof File && image.size > 0;
    const result = await integrateChatTurn({
      apiKey,
      address,
      locale,
      messages,
      userText: text,
      transcript,
      hasPhoto,
    });

    // Persist for authenticated owners when viewingId is provided.
    if (viewingId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase
          .from("viewings")
          .update({
            messages: result.messages,
            updated_at: new Date().toISOString(),
            client_updated_at: new Date().toISOString(),
          })
          .eq("id", viewingId)
          .eq("user_id", user.id);
        if (error) {
          // Non-fatal for guest-first UX; client still has messages.
          console.error("viewing_chat_turn_persist", error.message);
        }
      }
    }

    return boundary.applyCookie(
      NextResponse.json({
        userMessage: result.userMessage,
        aiMessage: result.aiMessage,
        messages: result.messages,
      }),
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
