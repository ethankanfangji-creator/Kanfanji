import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  assertContentLength,
  authorizeAiRequest,
  resolveAiLocale,
  validateConsent,
} from "@/lib/ai-boundary/server-entry";
import { assemblePropertyFacts } from "@/lib/property-facts/orchestrator";
import { projectFactCardToReport } from "@/lib/property-facts/report";
import { buildChatReport } from "@/lib/viewing-chat/integrate";
import { FIELD_CATALOG } from "@/lib/viewing-chat/collection/field-catalog";
import type { ChatMessage } from "@/lib/viewing-chat/types";
import { appendChatMessages } from "@/lib/viewing-chat/append-messages";
import { parseChatState } from "@/lib/viewing-chat/thread-payload";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

function readPropertyRecord(body: Record<string, unknown>) {
  if (body.propertyRecord == null) return null;
  const encoded = JSON.stringify(body.propertyRecord);
  if (encoded.length > 32_768) throw new AiInputError("property_record_invalid", 400);
  if (!body.propertyRecord || typeof body.propertyRecord !== "object") {
    throw new AiInputError("property_record_invalid", 400);
  }
  const fields = (body.propertyRecord as { fields?: unknown }).fields;
  if (fields != null && typeof fields !== "object") {
    throw new AiInputError("property_record_invalid", 400);
  }
  const allowed = new Set(FIELD_CATALOG.map((entry) => entry.fieldId));
  for (const [id, field] of Object.entries((fields ?? {}) as Record<string, { value?: unknown }>)) {
    if (!allowed.has(id as never)) throw new AiInputError("property_record_invalid", 400);
    if (field?.value != null && String(field.value).length > 300) {
      throw new AiInputError("property_record_invalid", 400);
    }
  }
  return body.propertyRecord as { fields?: Record<string, { value?: string | null; status?: string }> };
}

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const body = (await request.json()) as Record<string, unknown>;
    const consent = validateConsent((key) => body[key]);
    const boundary = await authorizeAiRequest(request, consent);

    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!address) throw new AiInputError("address_invalid");
    const locale = resolveAiLocale(body.locale);
    const viewingId = typeof body.viewingId === "string" ? body.viewingId.trim() : "";
    const messages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
    const propertyRecord = readPropertyRecord(body);
    const propertyData =
      body.propertyData == null
        ? null
        : JSON.stringify(body.propertyData).length > 32_768
          ? null
          : body.propertyData;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AiInputError("ai_unavailable", 503);

    const card = await assemblePropertyFacts({ address });
    const propertyReport = projectFactCardToReport(card);

    const { report, aiMessage } = await buildChatReport({
      apiKey,
      address,
      locale,
      messages,
      propertyReport,
      propertyRecord,
      propertyData,
    });
    const nextMessages = [...messages, aiMessage];

    let persisted = false;
    if (viewingId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        let chatState: Record<string, unknown> | undefined;
        if (body.chatState !== undefined) {
          chatState = parseChatState(body.chatState);
        }
        const admin = createAdminClient();
        const current = await admin
          .from("viewings")
          .select("messages, revision")
          .eq("id", viewingId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!current.error && current.data) {
          const existing = Array.isArray(current.data.messages)
            ? (current.data.messages as ChatMessage[])
            : [];
          const merged = appendChatMessages(existing, nextMessages);
          const revision = Number(current.data.revision ?? 1);
          const { error } = await admin
            .from("viewings")
            .update({
              messages: merged,
              report,
              ...(chatState ? { chat_state: chatState } : {}),
              revision: revision + 1,
              updated_at: new Date().toISOString(),
              client_updated_at: new Date().toISOString(),
            })
            .eq("id", viewingId)
            .eq("user_id", user.id);
          persisted = !error;
        }
      }
    }

    return boundary.applyCookie(
      NextResponse.json({
        report,
        aiMessage,
        messages: nextMessages,
        propertyReport,
        persisted,
      }),
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
