import "server-only";
import {
  AI_FEEDBACK_HISTORY_LIMIT,
  clampArtifactExcerpt,
  clampFeedbackReason,
  formatPreferenceBlock,
  type AiFeedbackEvent,
  type AiFeedbackKind,
} from "@/lib/viewing-chat/ai-preferences";
import { createAdminClient } from "@/utils/supabase/admin";

export async function loadRecentFeedback(
  userId: string,
  kind: AiFeedbackKind,
  limit = AI_FEEDBACK_HISTORY_LIMIT,
): Promise<AiFeedbackEvent[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_generation_feedback")
    .select("kind, rating, reason, artifact_excerpt, created_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((row) => ({
    kind: row.kind as AiFeedbackKind,
    rating: row.rating as "like" | "dislike",
    reason: clampFeedbackReason(row.reason),
    artifactExcerpt: clampArtifactExcerpt(row.artifact_excerpt),
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
  }));
}

export async function preferenceBlockForUser(
  userId: string | null | undefined,
  kind: AiFeedbackKind,
): Promise<string> {
  if (!userId) return "";
  const events = await loadRecentFeedback(userId, kind);
  return formatPreferenceBlock(events, kind);
}
