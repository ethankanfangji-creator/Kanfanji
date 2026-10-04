import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  assertContentLength,
  authorizeAiRequest,
  resolveAiLocale,
  validateConsent,
} from "@/lib/ai-boundary/server-entry";
import { notesFingerprint } from "@/lib/viewing-chat/briefing";
import { buildNotesOnlyReport } from "@/lib/viewing-chat/notes-report";
import type { ChatMessage } from "@/lib/viewing-chat/types";
import { appendChatMessages } from "@/lib/viewing-chat/append-messages";
import { mergeChatState } from "@/lib/viewing-chat/chat-state";
import { parseChatState } from "@/lib/viewing-chat/thread-payload";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AiInputError("ai_unavailable", 503);

    const { report, aiMessage } = await buildNotesOnlyReport({
      apiKey,
      address,
      locale,
      messages,
    });
    const fingerprint = report.notesFingerprint ?? notesFingerprint(messages);
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
        const withFingerprint = {
          ...(chatState ?? { v: 1 }),
          v: 1 as const,
          reportNotesFingerprint: fingerprint,
        };
        const admin = createAdminClient();
        const current = await admin
          .from("viewings")
          .select("messages, revision, chat_state")
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
              chat_state: mergeChatState(current.data.chat_state, withFingerprint),
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
        notesFingerprint: fingerprint,
        persisted,
      }),
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
