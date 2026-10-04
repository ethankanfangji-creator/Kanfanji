import type { PortfolioChatTurn } from "./types";

/** Recent turns sent to the model (not the full scrollback UI). */
export const PORTFOLIO_HISTORY_MAX_TURNS = 6;
export const PORTFOLIO_HISTORY_TEXT_MAX = 800;

export type PortfolioHistoryTurn = {
  role: "user" | "assistant";
  text: string;
};

export type PortfolioRewriteHint =
  | "retry"
  | "shorter"
  | "more_citations"
  | "matches_only";

export function buildHistoryForAsk(
  turns: PortfolioChatTurn[],
  max = PORTFOLIO_HISTORY_MAX_TURNS,
): PortfolioHistoryTurn[] {
  return turns.slice(-max).map((turn) => ({
    role: turn.role,
    text: turn.text.trim().slice(0, PORTFOLIO_HISTORY_TEXT_MAX),
  }));
}

/** Drop the trailing assistant turn so a rewrite re-answers the last user question. */
export function historyExcludingTrailingAssistant(
  turns: PortfolioChatTurn[],
): PortfolioChatTurn[] {
  if (turns.length === 0) return [];
  const last = turns[turns.length - 1];
  if (last.role === "assistant") return turns.slice(0, -1);
  return turns;
}

export function findLastUserQuestion(turns: PortfolioChatTurn[]): string | null {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].role === "user" && turns[i].text.trim()) return turns[i].text.trim();
  }
  return null;
}

export function formatHistoryForPrompt(history: PortfolioHistoryTurn[]): string {
  if (history.length === 0) return "";
  const lines = history.map((turn, index) => {
    const label = turn.role === "user" ? "User" : "Assistant";
    return `${index + 1}. ${label}: ${turn.text}`;
  });
  return `PRIOR_TURNS (same session; use for follow-ups like「這幾間」「剛才那些」):\n${lines.join("\n")}`;
}

export function rewriteHintInstruction(hint: PortfolioRewriteHint | null | undefined): string {
  if (!hint || hint === "retry") {
    return "REWRITE: Produce a fresh answer to the same question; keep grounding rules.";
  }
  if (hint === "shorter") {
    return "REWRITE: Make the answer shorter and more scannable (bullets OK). Keep citations accurate.";
  }
  if (hint === "more_citations") {
    return "REWRITE: Keep the same substance but add clearer per-home evidence excerpts in citations.";
  }
  return "REWRITE: Focus on the matching homes list; minimize prose. Still respect「筆記未提到」.";
}

export function validateHistoryTurns(raw: unknown): PortfolioHistoryTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: PortfolioHistoryTurn[] = [];
  for (const item of raw.slice(0, PORTFOLIO_HISTORY_MAX_TURNS)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const role = row.role === "user" || row.role === "assistant" ? row.role : null;
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!role || !text) continue;
    out.push({ role, text: text.slice(0, PORTFOLIO_HISTORY_TEXT_MAX) });
  }
  return out;
}

export function parseRewriteHint(value: unknown): PortfolioRewriteHint | null {
  if (
    value === "retry" ||
    value === "shorter" ||
    value === "more_citations" ||
    value === "matches_only"
  ) {
    return value;
  }
  return null;
}
