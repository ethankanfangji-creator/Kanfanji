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
import { createClient } from "@/utils/supabase/server";

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

    if (viewingId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("viewings")
          .update({
            messages: nextMessages,
            report,
            updated_at: new Date().toISOString(),
            client_updated_at: new Date().toISOString(),
          })
          .eq("id", viewingId)
          .eq("user_id", user.id);
      }
    }

    return boundary.applyCookie(
      NextResponse.json({
        report,
        aiMessage,
        messages: nextMessages,
        propertyReport,
      }),
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
