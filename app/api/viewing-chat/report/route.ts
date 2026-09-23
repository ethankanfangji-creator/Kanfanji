import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  assertContentLength,
  authorizeAiRequest,
  validateConsent,
} from "@/lib/ai-boundary/server-entry";
import { assemblePropertyFacts } from "@/lib/property-facts/orchestrator";
import { projectFactCardToReport } from "@/lib/property-facts/report";
import { buildChatReport } from "@/lib/viewing-chat/integrate";
import type { ChatMessage } from "@/lib/viewing-chat/types";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const body = (await request.json()) as Record<string, unknown>;
    const consent = validateConsent((key) => body[key]);
    const boundary = await authorizeAiRequest(request, consent);

    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!address) throw new AiInputError("address_invalid");
    const locale = typeof body.locale === "string" ? body.locale : "zh-Hant";
    const viewingId = typeof body.viewingId === "string" ? body.viewingId.trim() : "";
    const messages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];

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
