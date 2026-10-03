import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  assertContentLength,
  authorizeAiRequest,
  resolveAiLocale,
  validateConsent,
} from "@/lib/ai-boundary/server-entry";
import { getBriefingPrompt } from "@/lib/prompts/get-system-prompt";
import { assemblePropertyFacts } from "@/lib/property-facts/orchestrator";
import {
  emptyBriefing,
  isViewingBriefing,
  type ViewingBriefing,
  type ViewingBriefingPoint,
} from "@/lib/viewing-chat/briefing";
import { extractBriefingFoundFacts } from "@/lib/viewing-chat/briefing-facts";
import { mergeChatState } from "@/lib/viewing-chat/chat-state";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

function parsePoints(raw: unknown, allowedSources: Set<string>): ViewingBriefingPoint[] {
  if (!Array.isArray(raw)) return [];
  const points: ViewingBriefingPoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const text = typeof (item as { text?: unknown }).text === "string"
      ? (item as { text: string }).text.trim()
      : "";
    const source = typeof (item as { source?: unknown }).source === "string"
      ? (item as { source: string }).source.trim()
      : "";
    if (!text || !source) continue;
    if (allowedSources.size > 0 && !allowedSources.has(source)) continue;
    points.push({ text: text.slice(0, 280), source: source.slice(0, 120) });
    if (points.length >= 5) break;
  }
  return points;
}

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

    if (facts.length > 0 && apiKey) {
      try {
        const openai = new OpenAI({ apiKey });
        const system = getBriefingPrompt(locale);
        const completion = await openai.chat.completions.create(
          {
            model: "gpt-4o-mini",
            temperature: 0.2,
            response_format: { type: "json_object" },
            max_tokens: 700,
            messages: [
              { role: "system", content: system },
              {
                role: "user",
                content: `Address: ${address}
locale: ${locale}

FOUND_FACTS (only these may be used):
${JSON.stringify(facts, null, 0)}

Return JSON: {"points":[{"text":string,"source":string}]}`,
              },
            ],
          },
          { signal: AbortSignal.timeout(45_000) },
        );
        const raw = completion.choices[0]?.message?.content?.trim() || "{}";
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const allowed = new Set(facts.map((fact) => fact.source));
        const points = parsePoints(parsed.points, allowed);
        briefing = {
          address,
          points,
          sourcesQueried,
          generatedAt: new Date().toISOString(),
        };
      } catch {
        briefing = emptyBriefing(address, sourcesQueried);
      }
    }

    if (!isViewingBriefing(briefing)) {
      briefing = emptyBriefing(address, sourcesQueried);
    }

    if (viewingId) {
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
          await admin
            .from("viewings")
            .update({
              chat_state: mergeChatState(current.data.chat_state, {
                v: 1,
                briefing,
              }),
              revision: revision + 1,
              updated_at: new Date().toISOString(),
              client_updated_at: new Date().toISOString(),
            })
            .eq("id", viewingId)
            .eq("user_id", user.id);
        }
      }
    }

    return boundary.applyCookie(
      NextResponse.json({
        briefing,
        factsFound: facts.length,
        sourcesQueried,
      }),
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
