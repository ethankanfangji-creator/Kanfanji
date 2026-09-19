/**
 * Structured Step-2 viewing brief tickets, grounded in confirmed address + property basics.
 */

import type { PropertyBasicsSnapshot } from "@/lib/property-basics/types";
import type { WizardQuestion } from "./questions";

export const VIEWING_BRIEF_ID_BASE = 710_000;

export const VIEWING_BRIEF_CATEGORIES = [
  "condition",
  "transit",
  "amenities",
  "costs_docs",
  "onsite_confirm",
] as const;

export type ViewingBriefCategory = (typeof VIEWING_BRIEF_CATEGORIES)[number];

export type ViewingBriefPriority = "high" | "medium" | "low";

export type ViewingBriefTicketStatus = "to_confirm" | "answered" | "needs_more";

export type ViewingBriefTicketDef = {
  key: string;
  category: ViewingBriefCategory;
  priority: ViewingBriefPriority;
  /** Build title from address context — must stay property-specific. */
  title: (ctx: ViewingBriefContext) => string;
  description?: (ctx: ViewingBriefContext) => string;
  /** Optional legacy checklist preset id for sync compatibility. */
  checklistPreset?: string;
};

export type ViewingBriefContext = {
  address: string;
  market: "CA" | "TH" | "OTHER";
  place: string;
  propertyType: string | null;
  zoningCode: string | null;
  zoningLabel: string | null;
  pid: string | null;
  neighborhood: string | null;
  city: string | null;
};

export type ViewingBriefInput = {
  address: string;
  market: "CA" | "TH" | "OTHER";
  tags?: string[];
  openData?: {
    city?: string;
    zoningCode?: string;
    zoningLabel?: string;
    pid?: string;
  } | null;
  neighborhood?: string;
  city?: string;
  propertyBasics?: PropertyBasicsSnapshot | null;
};

function placeLabel(input: ViewingBriefInput): string {
  return (
    input.neighborhood?.trim() ||
    input.city?.trim() ||
    (typeof input.openData?.city === "string" ? input.openData.city.trim() : "") ||
    input.address.trim().split(",")[0]?.trim() ||
    input.address.trim() ||
    "this property"
  );
}

export function toViewingBriefContext(input: ViewingBriefInput): ViewingBriefContext {
  const basics = input.propertyBasics;
  return {
    address: input.address.trim(),
    market: input.market,
    place: placeLabel(input),
    propertyType:
      basics?.propertyType?.value && basics.propertyType.confidence !== "unknown"
        ? basics.propertyType.value
        : null,
    zoningCode: input.openData?.zoningCode?.trim() || null,
    zoningLabel: input.openData?.zoningLabel?.trim() || null,
    pid: input.openData?.pid?.trim() || null,
    neighborhood: input.neighborhood?.trim() || null,
    city: input.city?.trim() || input.openData?.city?.trim() || null,
  };
}

/** Canonical ticket set — categories required by product. */
export const VIEWING_BRIEF_DEFS: ViewingBriefTicketDef[] = [
  // 屋況
  {
    key: "condition_structure",
    category: "condition",
    priority: "high",
    checklistPreset: "wall_crack",
    title: (ctx) =>
      `Inspect structure & settlement at ${ctx.place}${
        ctx.propertyType ? ` (${ctx.propertyType})` : ""
      }`,
    description: () => "Look for cracks, uneven floors, sloping doors, or visible settlement.",
  },
  {
    key: "condition_leak",
    category: "condition",
    priority: "high",
    checklistPreset: "water_leak",
    title: (ctx) => `Check leaks / water stains around ${ctx.place}`,
    description: () => "Ceilings, windows, bathrooms, balcony edges, and under sinks.",
  },
  {
    key: "condition_light_air",
    category: "condition",
    priority: "medium",
    checklistPreset: "light_air",
    title: () => "Evaluate daylight and natural ventilation in each main room",
  },
  {
    key: "condition_noise",
    category: "condition",
    priority: "high",
    checklistPreset: "noise",
    title: (ctx) => `Listen for noise at ${ctx.place} (traffic, neighbors, HVAC)`,
  },
  {
    key: "condition_systems",
    category: "condition",
    priority: "high",
    checklistPreset: "electrical_panel",
    title: () => "Review equipment age & condition (electrical, water heater, HVAC/plumbing)",
    description: () => "Panel labels, shut-offs, leaks, and service stickers.",
  },
  {
    key: "condition_finish",
    category: "condition",
    priority: "medium",
    title: () => "Note renovation quality and deferred maintenance risks",
  },
  // 交通位置
  {
    key: "transit_public",
    category: "transit",
    priority: "high",
    title: (ctx) => `Confirm transit access for commuting from ${ctx.place}`,
    description: () => "Nearest SkyTrain / bus / BRT stops and typical wait times.",
  },
  {
    key: "transit_roads",
    category: "transit",
    priority: "medium",
    title: (ctx) => `Check major-road access and peak traffic near ${ctx.place}`,
  },
  {
    key: "transit_walk",
    category: "transit",
    priority: "medium",
    title: () => "Walk the block for walkability, sidewalks, and night safety feel",
  },
  {
    key: "transit_commute",
    category: "transit",
    priority: "medium",
    title: () => "Ask seller/agent about typical commute times to work hubs",
  },
  // 生活機能
  {
    key: "amenity_grocery",
    category: "amenities",
    priority: "medium",
    checklistPreset: "amenities",
    title: (ctx) => `Map grocery / daily errands walking distance from ${ctx.place}`,
  },
  {
    key: "amenity_dining",
    category: "amenities",
    priority: "low",
    title: () => "Note nearby dining options and late-night noise spillover",
  },
  {
    key: "amenity_school_health",
    category: "amenities",
    priority: "medium",
    title: () => "Confirm schools, clinics, and parks relevant to your household",
  },
  {
    key: "amenity_surroundings",
    category: "amenities",
    priority: "medium",
    title: (ctx) => `Observe surrounding uses and future construction near ${ctx.place}`,
  },
  // 費用與文件
  {
    key: "cost_price",
    category: "costs_docs",
    priority: "high",
    title: () => "Verify asking price, inclusions, and recent comparable sales (do not invent)",
    description: () => "Mark unknown until listing / agent documents are confirmed.",
  },
  {
    key: "cost_strata_fee",
    category: "costs_docs",
    priority: "high",
    title: (ctx) =>
      ctx.market === "TH"
        ? "Confirm common-area / sinking fund fees and what they cover"
        : "Confirm strata / management fees, special assessments, and contingency fund",
  },
  {
    key: "cost_tax_insurance",
    category: "costs_docs",
    priority: "medium",
    title: () => "Ask for property tax, insurance estimate, and utility averages",
  },
  {
    key: "cost_bylaws",
    category: "costs_docs",
    priority: "high",
    title: (ctx) =>
      ctx.zoningCode
        ? `Review bylaws / rental rules and zoning ${ctx.zoningCode}${
            ctx.zoningLabel ? ` (${ctx.zoningLabel})` : ""
          }`
        : "Review management bylaws, pets, rentals, and renovation rules",
  },
  {
    key: "cost_pending_docs",
    category: "costs_docs",
    priority: "high",
    title: (ctx) =>
      ctx.pid
        ? `Collect pending documents and confirm parcel PID ${ctx.pid}`
        : "List documents still missing (Form B / disclosure / floor plan / parking deed)",
  },
  // 建議現場確認
  {
    key: "onsite_parking",
    category: "onsite_confirm",
    priority: "high",
    checklistPreset: "parking",
    title: () => "On-site: confirm parking stall / locker assignment and access",
  },
  {
    key: "onsite_windows",
    category: "onsite_confirm",
    priority: "medium",
    checklistPreset: "window_fog",
    title: () => "On-site: open windows, check fogging, seals, and balcony drainage",
  },
  {
    key: "onsite_plumbing",
    category: "onsite_confirm",
    priority: "high",
    checklistPreset: "plumbing",
    title: () => "On-site: run water pressure, drains, and hot-water recovery",
  },
  {
    key: "onsite_agent_ask",
    category: "onsite_confirm",
    priority: "high",
    title: (ctx) =>
      `On-site must-ask about ${ctx.address}: disclosures, disputes, and upcoming levies`,
  },
];

export function buildViewingBriefTickets(input: ViewingBriefInput): WizardQuestion[] {
  const ctx = toViewingBriefContext(input);
  if (!ctx.address) return [];

  return VIEWING_BRIEF_DEFS.map((def, index) => {
    const title = def.title(ctx).trim();
    const description = def.description?.(ctx)?.trim();
    return {
      id: VIEWING_BRIEF_ID_BASE + index,
      text: title,
      checked: false,
      isDynamic: true,
      source: "viewing_brief",
      basedOn: `brief:${def.key}`,
      category: def.category,
      priority: def.priority,
      description,
      hint: [ctx.place, def.category, def.priority].filter(Boolean).join(" · "),
    } as WizardQuestion;
  });
}

export function isViewingBriefQuestion(question: WizardQuestion): boolean {
  return question.source === "viewing_brief" || Boolean(question.basedOn?.startsWith("brief:"));
}

/**
 * Seed / refresh brief tickets without wiping user answers on re-entry.
 * Prefers brief tickets; keeps photo/audio/follow-up extras.
 */
export function ensureViewingBriefQuestions(
  current: WizardQuestion[],
  input: ViewingBriefInput,
): WizardQuestion[] {
  const seeded = buildViewingBriefTickets(input);
  if (seeded.length === 0) return current;

  const existingByKey = new Map(
    current
      .filter((q) => q.basedOn?.startsWith("brief:"))
      .map((q) => [q.basedOn!, q] as const),
  );

  const brief = seeded.map((ticket) => {
    const existing = existingByKey.get(ticket.basedOn!);
    if (!existing) return ticket;
    return {
      ...ticket,
      id: existing.id,
      checked: existing.checked,
      answer: existing.answer,
      analysisStatus: existing.analysisStatus,
      answerPreview: existing.answerPreview,
      aiJobId: existing.aiJobId,
    };
  });

  const extras = current.filter(
    (q) =>
      !q.basedOn?.startsWith("brief:") &&
      q.source !== "viewing_brief" &&
      // Drop legacy generic checklist presets once brief covers the same ground.
      !(q.source === "checklist" && q.basedOn?.startsWith("preset:")),
  );

  return [...brief, ...extras];
}

export function resolveTicketStatus(question: WizardQuestion): ViewingBriefTicketStatus {
  if (question.analysisStatus === "failed") return "needs_more";
  const answered = Boolean(question.answer?.trim()) || question.checked;
  if (!answered) return "to_confirm";
  const answerLen = question.answer?.trim().length ?? 0;
  if (answerLen > 0 && answerLen < 12) return "needs_more";
  if (question.analysisStatus === "analyzing") return "needs_more";
  return "answered";
}

/** High-priority tickets still open (to confirm / needs more), excluding ignored discoveries. */
export function listHighPriorityOpenTickets(questions: WizardQuestion[]): WizardQuestion[] {
  return questions.filter((question) => {
    if (question.discoveryStatus === "ignored") return false;
    if (question.priority !== "high") return false;
    const status = resolveTicketStatus(question);
    return status === "to_confirm" || status === "needs_more";
  });
}

export function countHighPriorityOpenTickets(questions: WizardQuestion[]): number {
  return listHighPriorityOpenTickets(questions).length;
}

export function partitionByCategory(
  questions: WizardQuestion[],
): Array<{ category: ViewingBriefCategory | "other"; items: WizardQuestion[] }> {
  const buckets = new Map<ViewingBriefCategory | "other", WizardQuestion[]>();
  for (const category of VIEWING_BRIEF_CATEGORIES) buckets.set(category, []);
  buckets.set("other", []);

  for (const question of questions) {
    if (question.discoveryStatus === "ignored") continue;
    const category =
      question.category &&
      (VIEWING_BRIEF_CATEGORIES as readonly string[]).includes(question.category)
        ? (question.category as ViewingBriefCategory)
        : "other";
    buckets.get(category)!.push(question);
  }

  const ordered: Array<{ category: ViewingBriefCategory | "other"; items: WizardQuestion[] }> = [];
  for (const category of VIEWING_BRIEF_CATEGORIES) {
    const items = buckets.get(category) ?? [];
    if (items.length) ordered.push({ category, items });
  }
  const other = buckets.get("other") ?? [];
  if (other.length) ordered.push({ category: "other", items: other });
  return ordered;
}

export function parseAiBriefTickets(raw: unknown): Array<{
  title: string;
  category: ViewingBriefCategory;
  priority: ViewingBriefPriority;
  description?: string;
}> {
  if (!raw || typeof raw !== "object") return [];
  const tickets = (raw as { tickets?: unknown }).tickets;
  if (!Array.isArray(tickets)) return [];
  const out: Array<{
    title: string;
    category: ViewingBriefCategory;
    priority: ViewingBriefPriority;
    description?: string;
  }> = [];
  for (const item of tickets) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const category = row.category;
    const priority = row.priority;
    if (!title || title.length < 8 || title.length > 220) continue;
    if (!(VIEWING_BRIEF_CATEGORIES as readonly string[]).includes(String(category))) continue;
    if (priority !== "high" && priority !== "medium" && priority !== "low") continue;
    out.push({
      title,
      category: category as ViewingBriefCategory,
      priority,
      description:
        typeof row.description === "string" ? row.description.trim().slice(0, 240) : undefined,
    });
    if (out.length >= 8) break;
  }
  return out;
}
