import { NextResponse } from "next/server";
import OpenAI from "openai";
import { countryForMarket, getSystemPrompt, type PromptCountry } from "@/lib/prompts/get-system-prompt";
import { getNextQuestions } from "@/lib/store";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import {
  HOUSE_QUESTION_KEYS,
  questionForKey,
  stripInternalKeys,
} from "@/lib/viewing-chat/question-state";

export const runtime = "nodejs";

const updateHouseStateTool: OpenAI.Chat.ChatCompletionTool = {
  type: "function",
  function: {
    name: "update_house_state",
    description:
      "Save one field the user just stated. Put the internal key only in this function. The reply must use the user's language and must not contain the key.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", enum: [...HOUSE_QUESTION_KEYS] },
        value: { type: "string" },
        reply: {
          type: "string",
          description: "One follow-up sentence in the user's language. No internal keys and no English field names when the language is Chinese.",
        },
      },
      required: ["reply"],
      additionalProperties: false,
    },
  },
};

function asCountry(value: unknown): PromptCountry {
  return value === "US" || value === "CA" || value === "TW" ? value : "TW";
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

function asCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "number" && item > 0) out[key] = item;
  }
  return out;
}

const ALL_QUESTIONS = HOUSE_QUESTION_KEYS.map((key) => ({ key }));

async function persistQuestionState(
  viewingId: string,
  answered: Record<string, string>,
  askedCount: Record<string, number>,
) {
  if (!viewingId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const admin = createAdminClient();
  const current = await admin
    .from("viewings")
    .select("chat_state")
    .eq("id", viewingId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (current.error || !current.data) return;
  const prior =
    current.data.chat_state && typeof current.data.chat_state === "object"
      ? (current.data.chat_state as Record<string, unknown>)
      : {};
  await admin
    .from("viewings")
    .update({
      chat_state: { ...prior, v: 1, answered, askedCount },
      updated_at: new Date().toISOString(),
    })
    .eq("id", viewingId)
    .eq("user_id", user.id);
}

async function streamHouseChat(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    country?: unknown;
    language?: unknown;
    market?: unknown;
    text?: unknown;
    answered?: unknown;
    askedCount?: unknown;
    viewingId?: unknown;
    messages?: unknown;
  } | null;
  const country = asCountry(body?.country ?? countryForMarket(typeof body?.market === "string" ? body.market : null));
  const language = typeof body?.language === "string" && body.language.trim()
    ? body.language
    : country === "TW"
      ? "zh-Hant"
      : "en";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const viewingId = typeof body?.viewingId === "string" ? body.viewingId : "";
  const answered = asRecord(body?.answered);
  const askedCount = asCounts(body?.askedCount);
  if (!text) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }
  const nextQuestions = getNextQuestions(ALL_QUESTIONS, answered, askedCount);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    for (const question of nextQuestions) {
      askedCount[question.key] = (askedCount[question.key] || 0) + 1;
    }
    const reply = stripInternalKeys(
      nextQuestions[0] ? questionForKey(nextQuestions[0].key, language) : language.startsWith("en") ? "Got it." : "收到。",
      language,
    );
    await persistQuestionState(viewingId, answered, askedCount);
    return NextResponse.json({ reply, answered, askedCount });
  }

  const prior = Array.isArray(body?.messages)
    ? body.messages
        .filter((item): item is { role: "user" | "assistant"; content: string } => {
          if (!item || typeof item !== "object") return false;
          const row = item as { role?: unknown; content?: unknown };
          return (row.role === "user" || row.role === "assistant") && typeof row.content === "string";
        })
        .slice(-12)
    : [];

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    stream: true,
    tools: [updateHouseStateTool],
    tool_choice: { type: "function", function: { name: "update_house_state" } },
    messages: [
      {
        role: "system",
        content: `${getSystemPrompt(country, language, {
          answered_keys: Object.keys(answered),
        })}
Only ask these unanswered keys, at most once: ${nextQuestions.map((question) => question.key).join(", ") || "(none)"}
Do not ask a key listed in answered_keys.`,
      },
      ...prior,
      { role: "user", content: text },
    ],
  });

  let reply = "";
  let args = "";
  for await (const chunk of completion) {
    const delta = chunk.choices[0]?.delta;
    reply += delta?.content ?? "";
    for (const call of delta?.tool_calls ?? []) {
      args += call.function?.arguments ?? "";
    }
  }

  let toolKey = "";
  let toolValue = "";
  let toolReply = "";
  try {
    const parsed = JSON.parse(args) as { key?: unknown; value?: unknown; reply?: unknown };
    if (typeof parsed.key === "string") toolKey = parsed.key;
    if (typeof parsed.value === "string") toolValue = parsed.value;
    if (typeof parsed.reply === "string") toolReply = parsed.reply;
  } catch {
    toolReply = "";
  }

  if (toolKey && !answered[toolKey] && (askedCount[toolKey] || 0) < 1) {
    answered[toolKey] = toolValue || text;
    askedCount[toolKey] = (askedCount[toolKey] || 0) + 1;
  }
  const follow = nextQuestions.find((question) => question.key !== toolKey);
  for (const question of nextQuestions) {
    if ((askedCount[question.key] || 0) < 1) {
      askedCount[question.key] = (askedCount[question.key] || 0) + 1;
    }
  }
  const visible = stripInternalKeys(
    [toolReply || reply, follow ? questionForKey(follow.key, language) : ""].filter(Boolean).join(" "),
    language,
  );
  await persistQuestionState(viewingId, answered, askedCount);

  return NextResponse.json({
    reply: visible,
    answered,
    askedCount,
  });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const { POST: viewingTurn } = await import("../viewing-chat/turn/route");
    return viewingTurn(request);
  }
  return streamHouseChat(request);
}
