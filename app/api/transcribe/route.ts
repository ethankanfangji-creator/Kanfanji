import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  aiTimeoutMs,
  aiWhisperLanguage,
  assertContentLength,
} from "@/lib/ai-boundary/server-entry";
import { AI_LIMITS } from "@/lib/ai-boundary/config";
import { consumeAiQuota } from "@/lib/ai-boundary/quota";
import { getAccountTier } from "@/lib/entitlement/tier";
import { MEDIA_BUCKET } from "@/lib/supabase";
import { cardVoiceStoragePath } from "@/lib/viewing-card-record";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const VIEWING_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function audioType(file: File): string | null {
  const mime = file.type.toLowerCase().split(";")[0]?.trim() ?? "";
  if (
    mime === "audio/webm" ||
    mime === "audio/mp4" ||
    mime === "audio/mpeg" ||
    mime === "audio/wav" ||
    mime === "audio/x-wav" ||
    mime === "audio/ogg"
  ) {
    return mime;
  }
  return null;
}

function quotaError(quota: Awaited<ReturnType<typeof consumeAiQuota>>) {
  if (quota.allowed) return null;
  const status = quota.code === "ai_quota_exceeded" ? 429 : 503;
  const error = new AiInputError(quota.code, status);
  if (quota.code === "ai_quota_exceeded") {
    Object.assign(error, {
      tier: quota.tier,
      limit: quota.limit,
      resetsAt: quota.resetsAt,
      retryAfter: quota.retryAfter,
    });
  } else {
    Object.assign(error, { retryAfter: quota.retryAfter });
  }
  return error;
}

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

    const form = await request.formData();
    const viewingId = String(form.get("viewingId") || "");
    const templateId = String(form.get("templateId") || "");
    const audio = form.get("audio");
    if (!VIEWING_ID.test(viewingId) || !VIEWING_ID.test(templateId)) {
      throw new AiInputError("json_invalid", 400);
    }
    if (!(audio instanceof File) || audio.size <= 0 || audio.size > AI_LIMITS.audioBytes || !audioType(audio)) {
      throw new AiInputError("audio_mime_invalid", 415);
    }

    const { data: viewing, error: viewingError } = await supabase
      .from("viewings")
      .select("id")
      .eq("id", viewingId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (viewingError) throw new Error(viewingError.message);
    if (!viewing) return NextResponse.json({ error: "找不到這筆看房" }, { status: 404 });

    const { data: template, error: templateError } = await supabase
      .from("viewing_card_templates")
      .select("id")
      .eq("id", templateId)
      .maybeSingle();
    if (templateError) throw new Error(templateError.message);
    if (!template) return NextResponse.json({ error: "找不到這張卡" }, { status: 404 });

    const admin = createAdminClient();
    let tier: "free" | "pro" = "free";
    try {
      tier = await getAccountTier(admin, user.id);
    } catch {
      tier = "free";
    }
    const blocked = quotaError(await consumeAiQuota(request, { kind: "user", userId: user.id, tier }));
    if (blocked) throw blocked;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AiInputError("ai_unavailable", 503);

    const { data: card, error: cardError } = await supabase
      .from("viewing_cards")
      .upsert(
        {
          viewing_id: viewingId,
          template_id: templateId,
          collected_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "viewing_id,template_id" },
      )
      .select("id")
      .single();
    if (cardError || !card) throw new Error(cardError?.message || "card missing");

    const voicePath = cardVoiceStoragePath({
      ownerId: user.id,
      viewingId,
      cardId: card.id,
      file: audio,
    });
    const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(voicePath, audio, {
      contentType: audioType(audio) || "audio/webm",
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);

    const { error: pathError } = await supabase
      .from("viewing_cards")
      .update({ voice_path: voicePath, updated_at: new Date().toISOString() })
      .eq("id", card.id);
    if (pathError) throw new Error(pathError.message);

    const openai = new OpenAI({ apiKey });
    const transcription = await openai.audio.transcriptions.create(
      {
        file: audio,
        model: "whisper-1",
        language: aiWhisperLanguage("zh-Hant"),
      },
      { signal: AbortSignal.timeout(aiTimeoutMs()) },
    );
    const transcript = transcription.text?.trim() || "";
    if (!transcript) throw new AiInputError("ai_empty_transcript", 422);

    const { error: transcriptError } = await supabase
      .from("viewing_cards")
      .update({ voice_transcript: transcript, updated_at: new Date().toISOString() })
      .eq("id", card.id);
    if (transcriptError) throw new Error(transcriptError.message);

    return NextResponse.json({ transcript, voicePath });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
