import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  AiInputError,
  aiErrorResponse,
  aiTimeoutMs,
  aiWhisperLanguage,
  assertContentLength,
  authorizeAiRequest,
  resolveAiLocale,
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
    const locale = resolveAiLocale(form.get("locale"));
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
          language: aiWhisperLanguage(locale),
        },
        { signal: AbortSignal.timeout(aiTimeoutMs()) },
      );
      transcript = transcription.text?.trim() || "";
    }

    const hasPhoto = image instanceof File && image.size > 0;
    let photoAnalysis: string | undefined;
    let visionSlots:
      | Array<{
          fieldId: string;
          value: string;
          confidence?: number;
          note?: string;
        }>
      | undefined;
    if (hasPhoto && image instanceof File) {
      try {
        const buf = Buffer.from(await image.arrayBuffer());
        if (buf.byteLength > 0 && buf.byteLength <= AI_LIMITS.imageBytes) {
          const mime =
            image.type === "image/png" || image.type === "image/webp"
              ? image.type
              : "image/jpeg";
          const { extractPropertyFromImage } = await import(
            "@/lib/property-source/extract-vision"
          );
          const extracted = await extractPropertyFromImage({
            base64: buf.toString("base64"),
            mime,
            locale,
            apiKey,
          });
          if (extracted) {
            photoAnalysis = [
              extracted.extractedText
                ? `OCR: ${extracted.extractedText.slice(0, 400)}`
                : "",
              ...extracted.observedConditions.map((o) => `觀察（推測）：${o}`),
              ...extracted.uncertainItems.map((u) => `未確認：${u}`),
            ]
              .filter(Boolean)
              .join("\n")
              .slice(0, 1500);
            visionSlots = extracted.slots?.length ? extracted.slots : undefined;
          }
        }
      } catch {
        // Vision is best-effort; chat turn still proceeds with hasPhoto flag
      }
    }
    const replyRaw = form.get("replyTo");
    let replyTo: ChatMessage["replyTo"];
    if (typeof replyRaw === "string" && replyRaw.trim()) {
      try {
        const parsed = JSON.parse(replyRaw) as ChatMessage["replyTo"];
        if (
          parsed &&
          typeof parsed.messageId === "string" &&
          typeof parsed.preview === "string" &&
          (parsed.role === "user" || parsed.role === "ai")
        ) {
          replyTo = {
            messageId: parsed.messageId.slice(0, 120),
            role: parsed.role,
            preview: parsed.preview.slice(0, 200),
          };
        }
      } catch {
        // ignore malformed reply payload
      }
    }

    const result = await integrateChatTurn({
      apiKey,
      address,
      locale,
      messages,
      userText: text,
      transcript,
      hasPhoto,
      photoAnalysis,
      visionSlots,
      replyTo,
      agendaActiveId:
        typeof form.get("agendaActiveId") === "string"
          ? String(form.get("agendaActiveId")).trim() || null
          : null,
      agendaSkippedIds: (() => {
        const raw = form.get("agendaSkippedIds");
        if (typeof raw !== "string" || !raw.trim()) return [];
        try {
          const parsed = JSON.parse(raw) as unknown;
          return Array.isArray(parsed)
            ? parsed.filter((id): id is string => typeof id === "string").slice(0, 20)
            : [];
        } catch {
          return [];
        }
      })(),
      agendaMarket: (() => {
        const raw = String(form.get("agendaMarket") ?? "").trim().toUpperCase();
        if (raw === "US" || raw === "CA" || raw === "TW" || raw === "OTHER") {
          return raw;
        }
        return null;
      })(),
      propertyRecord: (() => {
        const raw = form.get("propertyRecord");
        if (typeof raw !== "string" || !raw.trim()) return null;
        try {
          return JSON.parse(raw) as import("@/lib/viewing-chat/collection/types").PropertyCollectionRecord;
        } catch {
          return null;
        }
      })(),
      propertyEvidence: (() => {
        const raw = form.get("propertyEvidence");
        if (typeof raw !== "string" || !raw.trim()) return [];
        try {
          const parsed = JSON.parse(raw) as unknown;
          return Array.isArray(parsed)
            ? (parsed as import("@/lib/viewing-chat/collection/types").PropertyFactEvidence[]).slice(
                0,
                200,
              )
            : [];
        } catch {
          return [];
        }
      })(),
      collectionSkippedFields: (() => {
        const raw = form.get("collectionSkippedFields");
        if (typeof raw !== "string" || !raw.trim()) return [];
        try {
          const parsed = JSON.parse(raw) as unknown;
          return Array.isArray(parsed)
            ? parsed
                .filter((id): id is string => typeof id === "string")
                .slice(0, 40) as import("@/lib/viewing-chat/collection/types").PropertyFieldId[]
            : [];
        } catch {
          return [];
        }
      })(),
      collectionFocusFieldIds: (() => {
        const raw = form.get("collectionFocusFieldIds");
        if (typeof raw !== "string" || !raw.trim()) return [];
        try {
          const parsed = JSON.parse(raw) as unknown;
          return Array.isArray(parsed)
            ? parsed
                .filter((id): id is string => typeof id === "string")
                .slice(0, 5) as import("@/lib/viewing-chat/collection/types").PropertyFieldId[]
            : [];
        } catch {
          return [];
        }
      })(),
      pendingConfirm: (() => {
        const raw = form.get("pendingConfirm");
        if (typeof raw !== "string" || !raw.trim()) return null;
        try {
          const parsed = JSON.parse(raw) as {
            fieldId?: string;
            candidateValue?: string;
            source?: string;
          };
          if (
            parsed &&
            typeof parsed.fieldId === "string" &&
            typeof parsed.candidateValue === "string"
          ) {
            return {
              fieldId: parsed.fieldId as import("@/lib/viewing-chat/collection/types").PropertyFieldId,
              candidateValue: parsed.candidateValue.slice(0, 200),
              source: (parsed.source as "inferred") || "inferred",
            };
          }
          return null;
        } catch {
          return null;
        }
      })(),
      beforeExtraction: async (_userMessage, messagesWithUser) => {
        // Persist raw user message before AI so model failure cannot erase input
        if (!viewingId) return;
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { error } = await supabase
          .from("viewings")
          .update({
            messages: messagesWithUser,
            updated_at: new Date().toISOString(),
            client_updated_at: new Date().toISOString(),
          })
          .eq("id", viewingId)
          .eq("user_id", user.id);
        if (error) {
          console.error("viewing_chat_turn_persist_user", error.message);
        }
      },
    });

    // Persist full turn (user + AI + collection) for authenticated owners
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
        agendaActiveId: result.agendaActiveId,
        agendaSkippedIds: result.agendaSkippedIds,
        propertyRecord: result.propertyRecord,
        propertyEvidence: result.propertyEvidence,
        collectionSkippedFields: result.collectionSkippedFields,
        changes: result.changes,
        conversationStatus: result.conversationStatus,
        turnWarnings: result.turnWarnings,
        suggestedQuestions: result.suggestedQuestions,
        extractionStatus: result.extractionStatus,
        rawAiResponse: result.rawAiResponse,
        collectionFocusFieldIds: result.collectionFocusFieldIds,
        pendingConfirm: result.pendingConfirm,
      }),
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
