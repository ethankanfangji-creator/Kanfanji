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
  askPortfolio,
  classifyAskQuestionThemes,
  parseRewriteHint,
  validateFactCards,
  validateHistoryTurns,
} from "@/lib/portfolio";
import { formatPreferenceBlock } from "@/lib/viewing-chat/ai-preferences";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { schedulePropertyAskThemes } from "@/lib/properties/signals";

export const runtime = "nodejs";

const SCOPE_MODES = new Set(["all", "time", "ids", "status"]);

async function loadPortfolioPreferenceBlock(userId: string | null): Promise<string> {
  if (!userId) return "";
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ai_generation_feedback")
      .select("kind, rating, reason, artifact_excerpt, created_at")
      .eq("user_id", userId)
      .eq("kind", "portfolio")
      .order("created_at", { ascending: false })
      .limit(12);
    if (!data?.length) return "";
    return formatPreferenceBlock(
      data.map((row) => ({
        kind: "portfolio" as const,
        rating: row.rating === "dislike" ? ("dislike" as const) : ("like" as const),
        reason: row.reason,
        artifactExcerpt: row.artifact_excerpt,
        createdAt: row.created_at,
      })),
      "portfolio",
    );
  } catch {
    return "";
  }
}

function optionalId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!id || id.length > 64) return null;
  return id;
}

function parseScopeMode(raw: unknown): "all" | "time" | "ids" | "status" {
  return typeof raw === "string" && SCOPE_MODES.has(raw)
    ? (raw as "all" | "time" | "ids" | "status")
    : "all";
}

async function insertAskSignal(input: {
  userId: string;
  question: string;
  cards: ReturnType<typeof validateFactCards>;
  result: Awaited<ReturnType<typeof askPortfolio>>;
  scopeMode: "all" | "time" | "ids" | "status";
  sessionId: string | null;
  turnId: string | null;
}): Promise<void> {
  try {
    const themes = classifyAskQuestionThemes(input.question);
    const hasShareComments = input.cards.some((card) => card.shareComments.length > 0);
    const admin = createAdminClient();
    await admin.from("portfolio_ask_signals").insert({
      user_id: input.userId,
      session_id: input.sessionId,
      turn_id: input.turnId,
      themes,
      scope_mode: input.scopeMode,
      home_count: Math.min(40, Math.max(0, input.cards.length)),
      matched_count: Math.min(40, Math.max(0, input.result.matchedIds.length)),
      has_share_comments: hasShareComments,
    });

    // Attribute themes to matched homes when present; otherwise all cards in scope.
    const matched = input.result.matchedIds.filter((id) => typeof id === "string");
    const viewingIds =
      matched.length > 0 ? matched : input.cards.map((card) => card.id);
    schedulePropertyAskThemes(admin, { viewingIds, themes });
  } catch {
    /* preference signal must never block the answer */
  }
}

export async function POST(request: Request) {
  try {
    assertContentLength(request);

    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }
    if (!userId) {
      return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const consent = validateConsent((key) => body[key]);
    const boundary = await authorizeAiRequest(request, consent);

    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) throw new AiInputError("question_invalid");
    if (question.length > 2000) throw new AiInputError("question_too_long");

    const locale = resolveAiLocale(body.locale);
    const cards = validateFactCards(body.cards);
    const history = validateHistoryTurns(body.history);
    const rewriteHint = parseRewriteHint(body.rewriteHint);
    const scopeMode = parseScopeMode(body.scopeMode);
    const sessionId = optionalId(body.sessionId);
    const turnId = optionalId(body.turnId);

    if (cards.length === 0) {
      return boundary.applyCookie(
        NextResponse.json({
          answer: "目前範圍內沒有看房記錄。請先記錄幾間，或放寬範圍後再問。",
          matchedIds: [],
          citations: [],
          suggestCompare: false,
        }),
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AiInputError("ai_unavailable", 503);

    const serverPrefs = await loadPortfolioPreferenceBlock(userId);
    const clientPrefs =
      typeof body.preferenceBlock === "string" ? body.preferenceBlock.trim().slice(0, 4000) : "";
    const preferenceBlock = [serverPrefs, clientPrefs].filter(Boolean).join("\n\n");

    const result = await askPortfolio({
      apiKey,
      question,
      cards,
      locale,
      history,
      rewriteHint,
      preferenceBlock,
    });

    void insertAskSignal({
      userId,
      question,
      cards,
      result,
      scopeMode,
      sessionId,
      turnId,
    });

    return boundary.applyCookie(NextResponse.json(result));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
