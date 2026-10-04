import { AI_CONSENT_VERSION } from "@/lib/ai-boundary/client";
import {
  appendLocalFeedbackEvent,
  clampArtifactExcerpt,
  clampFeedbackReason,
  type AiFeedbackKind,
  type AiFeedbackRating,
} from "@/lib/viewing-chat/ai-preferences";

function consentSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const key = "kanfangji.chat.consentSession";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `c_${Date.now()}`;
  window.sessionStorage.setItem(key, next);
  return next;
}

/** Persist a rating for preference memory (cloud when signed in; always local). */
export async function submitAiFeedback(input: {
  kind: AiFeedbackKind;
  rating: AiFeedbackRating;
  reason?: string | null;
  artifactExcerpt?: string | null;
  viewingId?: string | null;
  notesFingerprint?: string | null;
  generatedAt?: string | null;
  identityKind: "user" | "guest";
}): Promise<void> {
  const reason = clampFeedbackReason(input.reason);
  const artifactExcerpt = clampArtifactExcerpt(input.artifactExcerpt);
  const event = {
    kind: input.kind,
    rating: input.rating,
    reason,
    artifactExcerpt,
    createdAt: new Date().toISOString(),
  };
  appendLocalFeedbackEvent(event);

  if (input.identityKind !== "user") return;

  try {
    await fetch("/api/viewing-chat/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: input.kind,
        rating: input.rating,
        reason,
        artifactExcerpt,
        viewingId: input.viewingId || undefined,
        notesFingerprint: input.notesFingerprint || undefined,
        generatedAt: input.generatedAt || undefined,
        consentVersion: AI_CONSENT_VERSION,
        consentSessionId: consentSessionId(),
        identityKind: "user",
      }),
    });
  } catch {
    // Local memory already stored; cloud sync can fail quietly.
  }
}
