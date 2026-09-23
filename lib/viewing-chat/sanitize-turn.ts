import type { AgendaItem } from "./agenda";
import { resolveAgendaId } from "./agenda-catalog";

export type MatchedHit = { id: string; answer: string };

/** Short yes/no style replies that must attach to the *current* active item. */
export function isShortGenericReply(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 40) return false;
  return /^(沒有|沒有問題|沒有看起來不錯|看起來不錯|沒問題|無|還好|普通|可以|好|ok|okay|yes|yep|no|none|n\/a|nah|fine|all good|nothing|nope)([。.!！…]*)$/i.test(
    t,
  );
}

/**
 * Keep matched.answer as a short fact from the user — never the checklist question.
 */
export function sanitizeMatchedHits(input: {
  matched: MatchedHit[];
  agenda: AgendaItem[];
  userPayload: string;
}): MatchedHit[] {
  const user = input.userPayload.trim();
  const byId = new Map(
    input.agenda.map((item) => [item.id, item] as const),
  );

  const out: MatchedHit[] = [];
  for (const hit of input.matched) {
    const id = resolveAgendaId(hit.id);
    const item = byId.get(id);
    let answer = hit.answer.trim();
    if (!answer) continue;

    const question = item?.question?.trim() || "";
    const looksLikeQuestion =
      /[？?]\s*$/.test(answer) ||
      (question.length > 0 &&
        (answer === question ||
          answer.includes(question) ||
          (question.includes(answer) &&
            answer.length >= Math.min(12, question.length))));

    if (looksLikeQuestion) {
      answer = user.slice(0, 200);
    }

    // Still empty / still a question → drop
    if (!answer || /[？?]\s*$/.test(answer)) continue;

    out.push({ id, answer });
  }

  // If model filled nothing useful but user said something and we have an active item, record it.
  if (out.length === 0 && user) {
    const active = input.agenda.find((item) => item.status === "active");
    if (active) {
      out.push({ id: active.id, answer: user.slice(0, 200) });
    }
  }

  return out;
}

/**
 * Pin fills to the current active checklist item.
 * Prevents short replies like「沒有」from being credited to the *next* topic
 * when the model advances in the same turn.
 */
export function pinMatchedToActiveTopic(input: {
  matched: MatchedHit[];
  activeId: string | null | undefined;
  nextItemId?: string | null;
  userPayload: string;
}): MatchedHit[] {
  const activeId = input.activeId ? resolveAgendaId(input.activeId) : null;
  if (!activeId) return input.matched;

  const nextId = input.nextItemId
    ? resolveAgendaId(input.nextItemId)
    : null;
  const user = input.userPayload.trim();

  if (isShortGenericReply(user)) {
    return [{ id: activeId, answer: user.slice(0, 200) }];
  }

  if (input.matched.length === 0) {
    if (user) return [{ id: activeId, answer: user.slice(0, 200) }];
    return [];
  }

  return input.matched.map((hit) => {
    let id = resolveAgendaId(hit.id);
    // Same-turn advance must not attribute the fill to the upcoming item.
    if (nextId && id === nextId) id = activeId;
    return { id, answer: hit.answer };
  });
}

/**
 * analysis = short risk note for THIS turn only.
 * Drop next-topic dumps, checklist questions, or copies of the coach text.
 */
export function sanitizeAnalysisNote(input: {
  analysis: string | null | undefined;
  coachText: string;
  agenda: AgendaItem[];
}): string | undefined {
  const raw = input.analysis?.trim();
  if (!raw) return undefined;

  // Questions / next-check prompts belong in coach text, not the peach note.
  if (
    /[？?]\s*$/.test(raw) ||
    /要不要|請問|需要確認|請確認|Need to confirm|should we|check the|確認.*數量/i.test(
      raw,
    )
  ) {
    return undefined;
  }

  // Don't echo the visible coach reply.
  const coach = input.coachText.trim();
  if (coach && (raw === coach || coach.includes(raw) || raw.includes(coach.slice(0, 24)))) {
    return undefined;
  }

  // Don't paste other agenda questions as "analysis".
  for (const item of input.agenda) {
    const q = item.question.trim();
    if (q.length >= 8 && (raw.includes(q) || q.includes(raw))) {
      return undefined;
    }
  }

  return raw.slice(0, 180);
}
