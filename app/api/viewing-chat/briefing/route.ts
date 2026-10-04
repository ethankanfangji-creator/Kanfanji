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
  briefingHasContent,
  coerceViewingBriefing,
  emptyBriefing,
  type ViewingBriefing,
} from "@/lib/viewing-chat/briefing";
import { extractBriefingFoundFacts } from "@/lib/viewing-chat/briefing-facts";
import {
  generateAddressBriefing,
  isBriefingGenerateError,
} from "@/lib/viewing-chat/generate-briefing";
import { mergeChatState } from "@/lib/viewing-chat/chat-state";
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
    if (!address || address.length > 500) throw new AiInputError("address_invalid");
    const locale = resolveAiLocale(body.locale);
    const viewingId = typeof body.viewingId === "string" ? body.viewingId.trim() : "";

    const card = await assemblePropertyFacts({ address });
    const { facts, sourcesQueried } = extractBriefingFoundFacts(card);

    let briefing: ViewingBriefing = emptyBriefing(address, sourcesQueried);
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      try {
        briefing = await generateAddressBriefing({
          address,
          locale,
          facts,
          listingFacts: [],
          listingUrl: null,
          sourcesQueried,
          apiKey,
          signal: AbortSignal.timeout(60_000),
        });
      } catch (error) {
        if (isBriefingGenerateError(error)) {
          // Do not persist empty shells; surface typed code for client retry.
          return boundary.applyCookie(
            NextResponse.json(
              {
                error: "AI request could not be completed.",
                code: error.code,
                briefing: emptyBriefing(address, [...sourcesQueried, "openai_web_search"]),
              },
              { status: error.status },
            ),
          );
        }
        console.error("[briefing/route] unexpected generate error", address, error);
        throw error;
      }
    }

    briefing = coerceViewingBriefing(briefing) ?? emptyBriefing(address, sourcesQueried);

    // Only persist non-empty briefings. Empty shells used to stick in chat_state
    // and block client retries because address still "matched".
    // Persist failures must not hide a successful briefing from the client.
    let savedRevision: number | undefined;
    if (viewingId && briefingHasContent(briefing)) {
      try {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const admin = createAdminClient();
          const current = await admin
            .from("viewings")
            .select("revision, chat_state")
            .eq("id", viewingId)
            .eq("user_id", user.id)
            .maybeSingle();
          if (!current.error && current.data) {
            const revision = Number(current.data.revision ?? 1);
            savedRevision = revision + 1;
            const { error: updateError } = await admin
              .from("viewings")
              .update({
                chat_state: mergeChatState(current.data.chat_state, {
                  v: 1,
                  briefing,
                }),
                revision: savedRevision,
                updated_at: new Date().toISOString(),
                client_updated_at: new Date().toISOString(),
              })
              .eq("id", viewingId)
              .eq("user_id", user.id);
            if (updateError) {
              console.error("[briefing/route] persist failed", viewingId, updateError);
              savedRevision = undefined;
            }
          }
        }
      } catch (error) {
        console.error("[briefing/route] persist threw", viewingId, error);
        savedRevision = undefined;
      }
    }

    return boundary.applyCookie(
      NextResponse.json({
        briefing,
        factsFound: facts.length,
        sourcesQueried: briefing.sourcesQueried,
        revision: savedRevision,
      }),
    );
  } catch (error) {
    console.error("[briefing/route] failed", error);
    return aiErrorResponse(error);
  }
}
