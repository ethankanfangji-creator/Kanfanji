import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  assertContentLength,
  authorizeAiRequest,
  validateConsent,
} from "@/lib/ai-boundary/server-entry";
import {
  AI_FEEDBACK_REASON_MAX,
  clampArtifactExcerpt,
  clampFeedbackReason,
  type AiFeedbackKind,
  type AiFeedbackRating,
} from "@/lib/viewing-chat/ai-preferences";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

function parseKind(value: unknown): AiFeedbackKind {
  if (value === "briefing" || value === "report" || value === "portfolio") return value;
  throw new AiInputError("invalid_request");
}

function parseRating(value: unknown): AiFeedbackRating {
  if (value === "like" || value === "dislike") return value;
  throw new AiInputError("invalid_request");
}

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const body = (await request.json()) as Record<string, unknown>;
    const consent = validateConsent((key) => body[key]);
    const boundary = await authorizeAiRequest(request, consent);

    const kind = parseKind(body.kind);
    const rating = parseRating(body.rating);
    const reason = clampFeedbackReason(
      typeof body.reason === "string" ? body.reason : null,
    );
    if (typeof body.reason === "string" && body.reason.trim().length > AI_FEEDBACK_REASON_MAX) {
      throw new AiInputError("invalid_request");
    }
    const artifactExcerpt = clampArtifactExcerpt(
      typeof body.artifactExcerpt === "string" ? body.artifactExcerpt : null,
    );
    const viewingId =
      typeof body.viewingId === "string" && body.viewingId.trim()
        ? body.viewingId.trim()
        : null;
    const notesFingerprint =
      typeof body.notesFingerprint === "string" && body.notesFingerprint.trim()
        ? body.notesFingerprint.trim().slice(0, 200)
        : null;
    const generatedAt =
      typeof body.generatedAt === "string" && body.generatedAt.trim()
        ? body.generatedAt.trim()
        : null;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return boundary.applyCookie(
        NextResponse.json({ ok: false, code: "UNAUTHENTICATED", guest: true }, { status: 401 }),
      );
    }

    if (viewingId) {
      const owned = await supabase
        .from("viewings")
        .select("id")
        .eq("id", viewingId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (owned.error || !owned.data) throw new AiInputError("invalid_request");
    }

    const admin = createAdminClient();
    const { error } = await admin.from("ai_generation_feedback").insert({
      user_id: user.id,
      viewing_id: viewingId,
      kind,
      rating,
      reason,
      artifact_excerpt: artifactExcerpt,
      notes_fingerprint: notesFingerprint,
      generated_at: generatedAt,
    });
    if (error) {
      return boundary.applyCookie(
        NextResponse.json({ ok: false, code: "unavailable" }, { status: 503 }),
      );
    }

    return boundary.applyCookie(NextResponse.json({ ok: true }));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
