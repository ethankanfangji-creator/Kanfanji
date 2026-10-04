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
import {
  coerceViewingBriefing,
  notesFingerprint,
  type ViewingBriefing,
} from "@/lib/viewing-chat/briefing";
import { extractBriefingFoundFacts } from "@/lib/viewing-chat/briefing-facts";
import { preferenceBlockForUser } from "@/lib/viewing-chat/ai-preferences-server";
import { buildNotesOnlyReport } from "@/lib/viewing-chat/notes-report";
import type { ChatMessage, ChatReportSnapshot } from "@/lib/viewing-chat/types";
import { mergeChatState } from "@/lib/viewing-chat/chat-state";
import { parseChatState } from "@/lib/viewing-chat/thread-payload";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

async function persistReportVersion(input: {
  admin: ReturnType<typeof createAdminClient>;
  viewingId: string;
  userId: string;
  report: ChatReportSnapshot;
  fingerprint: string;
}): Promise<number | null> {
  const latest = await input.admin
    .from("viewing_report_versions")
    .select("version")
    .eq("viewing_id", input.viewingId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = Number(latest.data?.version ?? 0) + 1;
  const { error } = await input.admin.from("viewing_report_versions").insert({
    viewing_id: input.viewingId,
    version: nextVersion,
    snapshot: input.report,
    notes_fingerprint: input.fingerprint,
    source: "notes_report",
    created_by: input.userId,
  });
  if (error) return null;
  return nextVersion;
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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AiInputError("ai_unavailable", 503);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const clientPreferenceBlock =
      typeof body.preferenceBlock === "string" ? body.preferenceBlock.trim() : "";
    const preferenceBlock =
      (await preferenceBlockForUser(user?.id, "report")) || clientPreferenceBlock;

    let propertyFacts: ReturnType<typeof extractBriefingFoundFacts>["facts"] = [];
    try {
      const card = await assemblePropertyFacts({ address });
      propertyFacts = extractBriefingFoundFacts(card).facts;
    } catch (error) {
      console.error("[report/route] property facts assemble failed", address, error);
    }

    let briefing: ViewingBriefing | null = coerceViewingBriefing(body.briefing);
    if (!briefing && body.chatState !== undefined) {
      const chatState = parseChatState(body.chatState);
      briefing = coerceViewingBriefing(chatState?.briefing) ?? null;
    }

    const { report: builtReport } = await buildNotesOnlyReport({
      apiKey,
      address,
      locale,
      messages,
      preferenceBlock,
      propertyFacts,
      briefing,
    });
    const fingerprint = builtReport.notesFingerprint ?? notesFingerprint(messages);
    let report: ChatReportSnapshot = builtReport;

    let persisted = false;
    let version: number | null = null;
    let savedRevision: number | undefined;
    if (viewingId) {
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
          .select("revision, chat_state")
          .eq("id", viewingId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!current.error && current.data) {
          version = await persistReportVersion({
            admin,
            viewingId,
            userId: user.id,
            report: builtReport,
            fingerprint,
          });
          if (version != null) {
            report = { ...builtReport, version };
          }
          const revision = Number(current.data.revision ?? 1);
          const nextRevision = revision + 1;
          const { error } = await admin
            .from("viewings")
            .update({
              report,
              chat_state: mergeChatState(current.data.chat_state, withFingerprint),
              revision: nextRevision,
              updated_at: new Date().toISOString(),
              client_updated_at: new Date().toISOString(),
            })
            .eq("id", viewingId)
            .eq("user_id", user.id);
          persisted = !error;
          if (!error) savedRevision = nextRevision;
        }
      }
    }

    return boundary.applyCookie(
      NextResponse.json({
        report,
        notesFingerprint: fingerprint,
        version,
        persisted,
        revision: savedRevision,
      }),
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
