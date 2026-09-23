/**
 * Locale-aware labels for agenda seeds (i18n Messages.chat).
 */

import type { Messages } from "@/lib/i18n/types";
import type { AgendaSeedDef } from "./agenda-catalog";
import type { AgendaLabelResolver } from "./agenda";

type ChatAgendaCopy = Messages["chat"];

export function createAgendaLabelResolver(
  chat: ChatAgendaCopy,
): AgendaLabelResolver {
  return (seed: AgendaSeedDef) => {
    const raw =
      chat.agendaItems[seed.id as keyof ChatAgendaCopy["agendaItems"]] ??
      seed.id;
    const question = stripMarketPrefix(raw);
    const category =
      chat.agendaCategories[seed.category] ?? seed.category;
    return { question, category };
  };
}

/** Remove leading (台)/(加)/(美) or (TW)/(CA)/(US) market tags from coach copy. */
export function stripMarketPrefix(question: string): string {
  return question
    .replace(/^[（(]\s*(台|加|美|TW|CA|US)\s*[）)]\s*/i, "")
    .trim();
}
