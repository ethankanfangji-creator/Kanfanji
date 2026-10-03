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
import {
  fallbackBriefing,
  type ViewingBriefing,
} from "@/lib/viewing-chat/briefing";
import { mergeChatState } from "@/lib/viewing-chat/chat-state";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

function asStringList(value: unknown, max = 5): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
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

    const apiKey = process.env.OPENAI_API_KEY;
    let briefing: ViewingBriefing = fallbackBriefing(address);

    if (apiKey) {
      try {
        const openai = new OpenAI({ apiKey });
        const completion = await openai.chat.completions.create(
          {
            model: "gpt-4o-mini",
            temperature: 0.4,
            response_format: { type: "json_object" },
            max_tokens: 500,
            messages: [
              {
                role: "system",
                content: `你幫買家準備「還沒進門」的看房看點。只能根據地址推測常見該注意什麼。
絕對不能寫成已經看過、已經聞到、已經確認。用「要聞／要看／要問」的預備語氣。
回傳 JSON：{"smell": string[], "look": string[], "ask": string[]}
每類 2–4 條，短句，語言：${locale.startsWith("en") ? "English" : locale.startsWith("th") ? "Thai" : "繁體中文"}。
不要編造該地址的具體屋況、噪音或成交事實。`,
              },
              {
                role: "user",
                content: `地址：${address}`,
              },
            ],
          },
          { signal: AbortSignal.timeout(30_000) },
        );
        const raw = completion.choices[0]?.message?.content?.trim() || "{}";
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const smell = asStringList(parsed.smell);
        const look = asStringList(parsed.look);
        const ask = asStringList(parsed.ask);
        if (smell.length && look.length && ask.length) {
          briefing = {
            address,
            smell,
            look,
            ask,
            generatedAt: new Date().toISOString(),
          };
        }
      } catch {
        briefing = fallbackBriefing(address);
      }
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

    return boundary.applyCookie(NextResponse.json({ briefing }));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
