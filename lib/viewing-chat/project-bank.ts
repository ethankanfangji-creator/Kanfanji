import {
  DEFAULT_QUESTION_BANK,
  type ChatMessage,
  type QuestionBankItem,
} from "./types";
import { resolveAgendaId } from "./agenda-catalog";

/**
 * Project a read-only question bank from chat messages.
 * Answers come from the latest AI `matched` / `new_card` turns.
 * Legacy ids (q_panel, q_leak, …) map onto current agenda catalog ids.
 */
export function projectQuestionBank(messages: ChatMessage[]): QuestionBankItem[] {
  const byId = new Map<string, QuestionBankItem>();

  for (const seed of DEFAULT_QUESTION_BANK) {
    byId.set(seed.id, {
      ...seed,
      answer: "",
      justDiscussed: false,
    });
  }

  let lastMatchedIds = new Set<string>();

  for (const message of messages) {
    if (message.role !== "ai") continue;

    if (message.type === "new_card" && message.question?.trim()) {
      const rawId =
        message.matched?.[0]?.id ||
        `q_${message.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)}`;
      const id = resolveAgendaId(rawId);
      byId.set(id, {
        id,
        category: message.category?.trim() || "新發現",
        question: message.question.trim(),
        answer: message.answer?.trim() || message.matched?.[0]?.answer || "",
        justDiscussed: false,
      });
      lastMatchedIds = new Set([id]);
      continue;
    }

    if (message.matched?.length) {
      lastMatchedIds = new Set();
      for (const hit of message.matched) {
        const id = resolveAgendaId(hit.id);
        const existing = byId.get(id);
        if (existing) {
          byId.set(id, {
            ...existing,
            answer: hit.answer.trim() || existing.answer,
            justDiscussed: false,
          });
        } else {
          byId.set(id, {
            id,
            category: "新發現",
            question: id,
            answer: hit.answer.trim(),
            justDiscussed: false,
          });
        }
        lastMatchedIds.add(id);
      }
    }
  }

  const items = [...byId.values()];
  const defaults = DEFAULT_QUESTION_BANK.map((d) => byId.get(d.id)!).filter(Boolean);
  const extras = items.filter(
    (item) => !DEFAULT_QUESTION_BANK.some((d) => d.id === item.id),
  );
  const ordered = [...defaults, ...extras].slice(0, 16);

  return ordered.map((item) => ({
    ...item,
    justDiscussed: lastMatchedIds.has(item.id),
  }));
}
