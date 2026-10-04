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
  parseRewriteHint,
  validateFactCards,
  validateHistoryTurns,
} from "@/lib/portfolio";
import { formatPreferenceBlock } from "@/lib/viewing-chat/ai-preferences";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  try {
    assertContentLength(request);
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

    return boundary.applyCookie(NextResponse.json(result));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
