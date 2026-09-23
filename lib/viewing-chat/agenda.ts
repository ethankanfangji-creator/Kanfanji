/**
 * On-site coaching agenda — checklist behind the chat.
 * Conversation surfaces at most one active item at a time.
 * Catalog: agenda-catalog.ts (universal SOP + US/CA/TW packs).
 * See docs/product-scope-a.md.
 */

import type { ChatMessage, QuestionBankItem } from "./types";
import { projectQuestionBank } from "./project-bank";
import {
  listAgendaSeedsForMarket,
  matchRedFlags,
  resolveAgendaId,
  type AgendaMarket,
  type AgendaPriority,
  type AgendaSeedDef,
} from "./agenda-catalog";

export type { AgendaMarket, AgendaPriority } from "./agenda-catalog";
export {
  inferAgendaMarket,
  listAgendaSeedsForMarket,
  matchRedFlags,
  resolveAgendaId,
} from "./agenda-catalog";

export type AgendaItemStatus = "pending" | "active" | "answered" | "skipped";

export type AgendaItem = {
  id: string;
  category: string;
  question: string;
  status: AgendaItemStatus;
  priority: AgendaPriority;
  answer: string;
  pack: AgendaSeedDef["pack"];
  whyEn: string;
};

export type AgendaLabelResolver = (seed: AgendaSeedDef) => {
  question: string;
  category: string;
};

export type AgendaProjectionInput = {
  messages: ChatMessage[];
  activeId?: string | null;
  skippedIds?: string[];
  market?: AgendaMarket;
  resolveLabels: AgendaLabelResolver;
};

export function buildAgendaOrderIds(market: AgendaMarket = "OTHER"): string[] {
  return listAgendaSeedsForMarket(market).map((seed) => seed.id);
}

export function openingAgendaActiveId(market: AgendaMarket = "OTHER"): string {
  return buildAgendaOrderIds(market)[0] ?? "q_exterior";
}

export function projectAgenda(input: AgendaProjectionInput): AgendaItem[] {
  const market = input.market ?? "OTHER";
  const seeds = listAgendaSeedsForMarket(market);
  const bank = projectQuestionBank(input.messages);
  const bankById = new Map<string, QuestionBankItem>();
  for (const item of bank) {
    bankById.set(resolveAgendaId(item.id), item);
    bankById.set(item.id, item);
  }
  const skipped = new Set(
    (input.skippedIds ?? []).map((id) => resolveAgendaId(id)),
  );

  const items: AgendaItem[] = seeds.map((seed) => {
    const fromBank = bankById.get(seed.id);
    const answer = fromBank?.answer?.trim() || "";
    const labels = input.resolveLabels(seed);
    let status: AgendaItemStatus = "pending";
    if (skipped.has(seed.id)) status = "skipped";
    else if (answer) status = "answered";
    return {
      id: seed.id,
      category: labels.category,
      question: labels.question,
      status,
      priority: seed.priority,
      answer,
      pack: seed.pack,
      whyEn: seed.whyEn,
    };
  });

  const preferredRaw = input.activeId ? resolveAgendaId(input.activeId) : null;
  const preferred =
    preferredRaw && items.some((item) => item.id === preferredRaw)
      ? preferredRaw
      : null;
  const activeId =
    preferred &&
    items.find((item) => item.id === preferred)?.status !== "answered" &&
    items.find((item) => item.id === preferred)?.status !== "skipped"
      ? preferred
      : pickNextAgendaId(items);

  return items.map((item) => ({
    ...item,
    status:
      item.status === "answered" || item.status === "skipped"
        ? item.status
        : item.id === activeId
          ? "active"
          : "pending",
  }));
}

export function pickNextAgendaId(agenda: AgendaItem[]): string | null {
  const open = agenda.filter(
    (item) => item.status === "pending" || item.status === "active",
  );
  return open[0]?.id ?? null;
}

export function getActiveAgendaItem(agenda: AgendaItem[]): AgendaItem | null {
  return agenda.find((item) => item.status === "active") ?? null;
}

export function countAgendaProgress(agenda: AgendaItem[]): {
  done: number;
  total: number;
  highPending: number;
} {
  const trackable = agenda.filter((item) => item.id !== "q_ask");
  const done = trackable.filter(
    (item) => item.status === "answered" || item.status === "skipped",
  ).length;
  const highPending = agenda.filter(
    (item) =>
      item.priority === "high" &&
      item.status !== "answered" &&
      item.status !== "skipped",
  ).length;
  return { done, total: trackable.length, highPending };
}

/** Topic stickiness from user text + red-flag rules. */
export function suggestTopicFromUserText(
  text: string,
  agenda: AgendaItem[],
): { agendaId: string; redFlagProbeEn?: string } | null {
  const openIds = new Set(agenda.map((item) => item.id));

  const flags = matchRedFlags(text);
  for (const flag of flags) {
    if (openIds.has(flag.agendaId)) {
      return { agendaId: flag.agendaId, redFlagProbeEn: flag.probeEn };
    }
  }

  // Light keyword fallbacks aligned to universal ids
  const hints: Array<{ id: string; patterns: RegExp[] }> = [
    { id: "q_odor", patterns: [/味|smell|musty|mold|臭/i] },
    { id: "q_water_damage", patterns: [/漏|水漬|潮|壁癌|leak|damp|stain/i] },
    { id: "q_electrical", patterns: [/電箱|安培|panel|breaker|插座/i] },
    { id: "q_plumbing", patterns: [/水壓|排水|馬桶|faucet|drain|plumbing/i] },
    { id: "q_hvac", patterns: [/空調|冷氣|暖氣|HVAC|furnace|熱泵/i] },
    { id: "q_noise", patterns: [/噪音|吵|noise|loud/i] },
    { id: "q_light", patterns: [/採光|通風|光線|light|draft/i] },
    { id: "q_exterior", patterns: [/外牆|排水|屋頂|grading|facade|外觀/i] },
    { id: "q_layout", patterns: [/格局|房數|動線|layout|bedroom/i] },
    { id: "q_storage_parking", patterns: [/車位|收納|車庫|parking|storage/i] },
    { id: "q_ca_strata", patterns: [/strata|管委|準備金|特別攤派|levy/i] },
    { id: "q_us_hoa", patterns: [/HOA|special assessment|condo fee/i] },
    { id: "q_tw_docs", patterns: [/謄本|說明書|實價/i] },
    { id: "q_tw_moisture", patterns: [/壁癌|窗框滲/i] },
  ];

  for (const hint of hints) {
    if (!openIds.has(hint.id)) continue;
    if (hint.patterns.some((re) => re.test(text))) {
      return { agendaId: hint.id };
    }
  }
  return null;
}

export function formatAgendaForPrompt(agenda: AgendaItem[]): string {
  return agenda
    .map((item) => {
      const ans = item.answer ? ` | answer=${item.answer}` : "";
      return `- id:${item.id} [${item.status}/${item.priority}/${item.pack}] ${item.question}${ans} · why: ${item.whyEn}`;
    })
    .join("\n");
}

export type AgendaAction = "probe" | "advance" | "hold" | "skip";

export function resolveNextActiveId(opts: {
  agenda: AgendaItem[];
  currentActiveId: string | null;
  agendaAction: AgendaAction;
  nextItemId?: string | null;
  matchedIds: string[];
}): string | null {
  const { agenda, currentActiveId, agendaAction, nextItemId, matchedIds } = opts;
  const byId = new Map(agenda.map((item) => [item.id, item]));
  const current = currentActiveId ? resolveAgendaId(currentActiveId) : null;
  const matched = matchedIds.map(resolveAgendaId);

  if (agendaAction === "hold" || agendaAction === "probe") {
    return current ?? pickNextAgendaId(agenda);
  }

  if (agendaAction === "skip" && current) {
    const without = agenda.map((item) =>
      item.id === current ? { ...item, status: "skipped" as const } : item,
    );
    return pickNextAgendaId(without);
  }

  const currentFilled =
    current &&
    (matched.includes(current) || Boolean(byId.get(current)?.answer));

  if (agendaAction === "advance" || currentFilled) {
    const next = nextItemId ? resolveAgendaId(nextItemId) : null;
    // Ignore model "next" that is still the current item (common LLM mistake).
    if (
      next &&
      next !== current &&
      byId.get(next)?.status !== "skipped"
    ) {
      const target = byId.get(next);
      if (target && target.status !== "answered") return next;
    }
    const rest = agenda.map((item) => {
      if (item.id === current && currentFilled) {
        return { ...item, status: "answered" as const };
      }
      return item;
    });
    return pickNextAgendaId(rest);
  }

  return current ?? pickNextAgendaId(agenda);
}
