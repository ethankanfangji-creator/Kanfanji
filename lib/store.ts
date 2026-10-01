export type HouseQuestion = { key: string };

export function getNextQuestions(
  allQuestions: HouseQuestion[],
  answered: Record<string, string | undefined>,
  askedCount: Record<string, number | undefined>,
) {
  return allQuestions
    .filter((q) => !answered[q.key] && (askedCount[q.key] || 0) < 1)
    .slice(0, 3);
}

const storageKey = (viewingId: string) => `kanfangji.questions.${viewingId}`;

export function saveQuestionState(
  viewingId: string,
  answered: Record<string, string>,
  askedCount: Record<string, number>,
) {
  if (typeof window === "undefined" || !viewingId) return;
  window.localStorage.setItem(storageKey(viewingId), JSON.stringify({ answered, askedCount }));
}

export function loadQuestionState(viewingId: string): {
  answered: Record<string, string>;
  askedCount: Record<string, number>;
} {
  if (typeof window === "undefined" || !viewingId) return { answered: {}, askedCount: {} };
  try {
    const raw = window.localStorage.getItem(storageKey(viewingId));
    if (!raw) return { answered: {}, askedCount: {} };
    const parsed = JSON.parse(raw) as { answered?: unknown; askedCount?: unknown };
    const answered: Record<string, string> = {};
    const askedCount: Record<string, number> = {};
    if (parsed.answered && typeof parsed.answered === "object" && !Array.isArray(parsed.answered)) {
      for (const [key, value] of Object.entries(parsed.answered)) {
        if (typeof value === "string") answered[key] = value;
      }
    }
    if (parsed.askedCount && typeof parsed.askedCount === "object" && !Array.isArray(parsed.askedCount)) {
      for (const [key, value] of Object.entries(parsed.askedCount)) {
        if (typeof value === "number") askedCount[key] = value;
      }
    }
    return { answered, askedCount };
  } catch {
    return { answered: {}, askedCount: {} };
  }
}
