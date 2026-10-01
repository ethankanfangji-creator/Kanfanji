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
import { extractFirstUrl, isListingPaste, pdfSourceRole } from "@/lib/viewing-chat/detect-source";
import { FIELD_CATALOG } from "@/lib/viewing-chat/collection/field-catalog";
import { agendaIdToFieldId } from "@/lib/viewing-chat/collection/field-map";
import { resolveAgendaId } from "@/lib/viewing-chat/agenda-catalog";
import type { PropertyFieldId } from "@/lib/viewing-chat/collection/types";
import type { ChatMessage } from "@/lib/viewing-chat/types";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { appendChatMessages } from "@/lib/viewing-chat/append-messages";
import { mergeChatState } from "@/lib/viewing-chat/chat-state";
import { classifyOwnedMediaPath, type MediaColumn } from "@/lib/viewing-chat/media-path";
import { MEDIA_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseMessages(raw: FormDataEntryValue | null): ChatMessage[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

async function persistAppendedMessages(
  viewingId: string,
  userId: string,
  incoming: ChatMessage[],
  chatState?: Record<string, unknown>,
) {
  const admin = createAdminClient();
  const current = await admin
    .from("viewings")
    .select("messages, revision, photo_urls, video_urls, audio_urls, chat_state")
    .eq("id", viewingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (current.error || !current.data) return false;
  const existing = Array.isArray(current.data.messages)
    ? (current.data.messages as ChatMessage[])
    : [];
  const merged = appendChatMessages(existing, incoming);
  const revision = Number(current.data.revision ?? 1);
  const mediaPatch = await acceptedMediaColumns(admin, userId, viewingId, incoming, current.data);
  const { error } = await admin
    .from("viewings")
    .update({
      messages: merged,
      ...(chatState ? { chat_state: mergeChatState(current.data.chat_state, chatState) } : {}),
      ...mediaPatch,
      revision: revision + 1,
      updated_at: new Date().toISOString(),
      client_updated_at: new Date().toISOString(),
    })
    .eq("id", viewingId)
    .eq("user_id", userId);
  return !error;
}

async function acceptedMediaColumns(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  viewingId: string,
  incoming: ChatMessage[],
  current: { photo_urls?: unknown; video_urls?: unknown; audio_urls?: unknown },
) {
  const grouped: Record<MediaColumn, string[]> = {
    photo_urls: Array.isArray(current.photo_urls) ? [...(current.photo_urls as string[])] : [],
    video_urls: Array.isArray(current.video_urls) ? [...(current.video_urls as string[])] : [],
    audio_urls: Array.isArray(current.audio_urls) ? [...(current.audio_urls as string[])] : [],
  };
  const paths = incoming.flatMap((message) =>
    (message.media ?? []).map((item) => item.path).filter((path): path is string => Boolean(path)),
  );
  let changed = false;
  for (const path of paths) {
    const column = classifyOwnedMediaPath(path, userId, viewingId);
    if (!column) {
      console.error("chat_media_path_rejected");
      continue;
    }
    const name = path.slice(path.lastIndexOf("/") + 1);
    const prefix = path.slice(0, path.lastIndexOf("/"));
    const listed = await admin.storage.from(MEDIA_BUCKET).list(prefix, { search: name, limit: 20 });
    if (listed.error || !listed.data?.some((file) => file.name === name)) {
      console.error("chat_media_missing");
      continue;
    }
    grouped[column].push(path);
    changed = true;
  }
  if (!changed) return {};
  return {
    photo_urls: [...new Set(grouped.photo_urls)],
    video_urls: [...new Set(grouped.video_urls)],
    audio_urls: [...new Set(grouped.audio_urls)],
  };
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
    const replyToMessageId = String(form.get("replyToMessageId") ?? "").trim().slice(0, 120);
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
    const targetId = replyToMessageId || replyTo?.messageId || "";
    const allowedFields = new Set(FIELD_CATALOG.map((entry) => entry.fieldId));
    let clientFieldIds: PropertyFieldId[] = [];
    const fieldRaw = form.get("replyToFieldIds");
    if (typeof fieldRaw === "string" && fieldRaw.trim()) {
      try {
        const parsed = JSON.parse(fieldRaw) as unknown;
        if (Array.isArray(parsed)) {
          clientFieldIds = parsed
            .filter((id): id is PropertyFieldId => typeof id === "string" && allowedFields.has(id as PropertyFieldId))
            .slice(0, 8);
        }
      } catch {
        clientFieldIds = [];
      }
    }
    const target = targetId ? messages.find((message) => message.id === targetId) : undefined;
    const serverFieldIds = target
      ? (target.role === "ai"
          ? (target.matched ?? [])
              .map((row) => agendaIdToFieldId(resolveAgendaId(row.id) ?? row.id))
              .filter((id): id is PropertyFieldId => allowedFields.has(id))
          : [])
      : [];
    const replyContext = target
      ? {
          targetMessageId: target.id,
          targetRole: target.role,
          quotedText: (target.text || target.transcript || replyTo?.preview || "").slice(0, 200),
          targetFieldIds: clientFieldIds.filter(
            (id) => serverFieldIds.length === 0 || serverFieldIds.includes(id),
          ),
        }
      : undefined;
    if (target) {
      replyTo = {
        messageId: target.id,
        role: target.role,
        preview: replyContext?.quotedText.slice(0, 200) || replyTo?.preview || "",
      };
    }
    const replyWarnings = targetId && !target ? ["reply_target_unknown"] : [];

    const listingUrl = extractFirstUrl(`${text}\n${transcript}`);
    const pastedListing = !listingUrl && isListingPaste(text);
    const pdf = form.get("file");
    let sourceBundle: {
      sources?: unknown;
      propertyData?: unknown;
      conflicts?: unknown;
      sourceStatus?: "ok" | "partial" | "soft_fail";
    } = {};
    if (listingUrl || pastedListing || (pdf instanceof File && pdf.size > 0 && pdf.type === "application/pdf")) {
      try {
        const { runPropertySourcePipeline } = await import("@/lib/property-source/pipeline");
        const pdfFile = pdf instanceof File && pdf.size > 0 ? pdf : null;
        const pipeline = await runPropertySourcePipeline({
          address,
          locale,
          sourceType: listingUrl ? "listing_url" : pastedListing ? "user_text" : "pdf",
          url: listingUrl ?? undefined,
          text: pastedListing ? text : undefined,
          fileBase64: pdfFile ? Buffer.from(await pdfFile.arrayBuffer()).toString("base64") : undefined,
          mimeType: pdfFile?.type,
          fileName: pdfFile?.name,
          sourceRole: pdfFile ? pdfSourceRole(`${pdfFile.name}\n${text}`) : "listing",
        });
        const errors = pipeline.source?.extractionErrors ?? [];
        sourceBundle = {
          sources: pipeline.sources,
          propertyData: pipeline.propertyData,
          conflicts: pipeline.conflicts,
          sourceStatus: errors.length ? "soft_fail" : "ok",
        };
      } catch {
        sourceBundle = { sourceStatus: "soft_fail" };
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
      replyContext,
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
      askedCount: (() => {
        const raw = form.get("askedCount");
        if (typeof raw !== "string" || !raw.trim()) return {};
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
          const counts: Record<string, number> = {};
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "number" && value >= 1) counts[key] = 1;
          }
          return counts;
        } catch {
          return {};
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
        await persistAppendedMessages(viewingId, user.id, messagesWithUser);
      },
    });

    // Persist full turn (user + AI + collection) for authenticated owners
    let persisted = false;
    if (viewingId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        persisted = await persistAppendedMessages(viewingId, user.id, result.messages, {
          v: 1,
          normalizedAddress: address,
          propertyRecord: result.propertyRecord,
          propertyEvidence: result.propertyEvidence,
          agendaActiveId: result.agendaActiveId,
          agendaSkippedIds: result.agendaSkippedIds,
          collectionSkippedFields: result.collectionSkippedFields,
          collectionFocusFieldIds: result.collectionFocusFieldIds,
          conversationStatus: result.conversationStatus,
          pendingConfirm: result.pendingConfirm,
          askedCount: result.askedCount,
        });
        if (!persisted) console.error("viewing_chat_turn_persist");
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
        turnWarnings: [...result.turnWarnings, ...replyWarnings],
        suggestedQuestions: result.suggestedQuestions,
        extractionStatus: result.extractionStatus,
        rawAiResponse: result.rawAiResponse,
        collectionFocusFieldIds: result.collectionFocusFieldIds,
        pendingConfirm: result.pendingConfirm,
        askedCount: result.askedCount,
        persisted,
        ...sourceBundle,
      }),
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
