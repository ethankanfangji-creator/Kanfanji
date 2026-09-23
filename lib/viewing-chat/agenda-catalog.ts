/**
 * On-site agenda catalog — universal first-visit SOP + market packs.
 * Source: 美加台看房SOP指南 §四-C / §六 (+ market add-ons).
 * Conversation still surfaces one item at a time (see agenda.ts).
 */

export type AgendaMarket = "US" | "CA" | "TW" | "OTHER";

export type AgendaPriority = "high" | "medium" | "low";

export type AgendaCategoryId =
  | "arrival"
  | "condition"
  | "systems"
  | "livability"
  | "ask"
  | "market";

export type AgendaSeedDef = {
  id: string;
  /** Lower = earlier in walk order within the merged list */
  order: number;
  priority: AgendaPriority;
  category: AgendaCategoryId;
  /** universal = always; market packs append for that market */
  pack: "universal" | AgendaMarket;
  /**
   * Short why for the LLM coach (English). Not shown as a full lesson in UI.
   */
  whyEn: string;
};

/**
 * Universal first on-site pass (~30–60 min), SOP §四-C order.
 * Ids are stable fill targets for chat turns / question bank.
 */
export const UNIVERSAL_AGENDA_SEEDS: AgendaSeedDef[] = [
  {
    id: "q_exterior",
    order: 10,
    priority: "medium",
    category: "arrival",
    pack: "universal",
    whyEn: "Facade, grading, drainage, and obvious envelope issues before going inside.",
  },
  {
    id: "q_odor",
    order: 20,
    priority: "high",
    category: "arrival",
    pack: "universal",
    whyEn: "Mold, smoke, pet, or sewage smells are fast risk signals.",
  },
  {
    id: "q_layout",
    order: 30,
    priority: "medium",
    category: "livability",
    pack: "universal",
    whyEn: "Fit to must-haves beats finish quality on a first pass.",
  },
  {
    id: "q_light",
    order: 40,
    priority: "medium",
    category: "livability",
    pack: "universal",
    whyEn: "Daylight, airflow, and window operation / drafts.",
  },
  {
    id: "q_water_damage",
    order: 50,
    priority: "high",
    category: "condition",
    pack: "universal",
    whyEn: "Visible water staining on ceilings, windows, and baths.",
  },
  {
    id: "q_electrical",
    order: 60,
    priority: "high",
    category: "systems",
    pack: "universal",
    whyEn: "Panel, outlet count, and wet-area protection where applicable.",
  },
  {
    id: "q_plumbing",
    order: 70,
    priority: "high",
    category: "systems",
    pack: "universal",
    whyEn: "Run taps, flush toilets, check pressure and drain speed.",
  },
  {
    id: "q_hvac",
    order: 80,
    priority: "medium",
    category: "systems",
    pack: "universal",
    whyEn: "Heating/cooling age, noise, and airflow.",
  },
  {
    id: "q_storage_parking",
    order: 90,
    priority: "low",
    category: "livability",
    pack: "universal",
    whyEn: "Storage, parking, and outdoor space fit daily life.",
  },
  {
    id: "q_noise",
    order: 100,
    priority: "medium",
    category: "livability",
    pack: "universal",
    whyEn: "Traffic, neighbours, elevator, and pipe noise.",
  },
  {
    id: "q_ask",
    order: 200,
    priority: "low",
    category: "ask",
    pack: "universal",
    whyEn: "Capture follow-ups for the agent / seller before leaving.",
  },
];

/** US pack — ask-agent / disclosure oriented (not a substitute for contracts). */
export const US_AGENDA_SEEDS: AgendaSeedDef[] = [
  {
    id: "q_us_disclosure",
    order: 150,
    priority: "medium",
    category: "market",
    pack: "US",
    whyEn:
      "Ask for seller disclosures; pre-1978 homes may need lead-paint disclosures. Chat notes only — not legal review.",
  },
  {
    id: "q_us_hoa",
    order: 160,
    priority: "medium",
    category: "market",
    pack: "US",
    whyEn: "If HOA/condo: special assessments, reserves, and pending litigation to ask about.",
  },
];

/** Canada pack — strata / condo document health. */
export const CA_AGENDA_SEEDS: AgendaSeedDef[] = [
  {
    id: "q_ca_strata",
    order: 150,
    priority: "high",
    category: "market",
    pack: "CA",
    whyEn:
      "For condo/strata: ask about contingency reserve, special levies, and recent meeting minutes — then have a lawyer review docs.",
  },
  {
    id: "q_ca_envelope",
    order: 155,
    priority: "medium",
    category: "market",
    pack: "CA",
    whyEn:
      "Older BC buildings: ask rainscreen / envelope repair history (leak condo context).",
  },
];

/** Taiwan pack — mid-age homes + docs to request. */
export const TW_AGENDA_SEEDS: AgendaSeedDef[] = [
  {
    id: "q_tw_moisture",
    order: 55,
    priority: "high",
    category: "market",
    pack: "TW",
    whyEn: "壁癌 / window-frame seepage common on mid-age stock; note fresh paint patches.",
  },
  {
    id: "q_tw_docs",
    order: 150,
    priority: "medium",
    category: "market",
    pack: "TW",
    whyEn:
      "Ask agent for 謄本、不動產說明書; compare 實價 later — on-site only capture the ask.",
  },
  {
    id: "q_tw_rain_revisit",
    order: 170,
    priority: "medium",
    category: "market",
    pack: "TW",
    whyEn: "Shortlist should revisit in rain when leaks / drainage matter.",
  },
];

export const MARKET_PACK_SEEDS: Record<"US" | "CA" | "TW", AgendaSeedDef[]> = {
  US: US_AGENDA_SEEDS,
  CA: CA_AGENDA_SEEDS,
  TW: TW_AGENDA_SEEDS,
};

/** Legacy bank ids → current catalog ids (fills still match). */
export const AGENDA_ID_ALIASES: Record<string, string> = {
  q_leak: "q_water_damage",
  q_panel: "q_electrical",
  q_fees: "q_ask",
};

export type RedFlagRule = {
  id: string;
  patterns: RegExp[];
  /** Prefer switching agenda to this item when matched */
  agendaId: string;
  /** LLM-only hint: force a single clarifying probe */
  probeEn: string;
};

/** SOP §六 red lights → sticky topic + probe. */
export const RED_FLAG_RULES: RedFlagRule[] = [
  {
    id: "rf_fresh_paint",
    patterns: [/新漆|局部.*漆|fresh paint|only painted|剛刷|補漆/i],
    agendaId: "q_water_damage",
    probeEn: "Where exactly was it freshly painted — ceiling, window, or bath? Any smell or soft spots?",
  },
  {
    id: "rf_mold_smell",
    patterns: [/霉味|霉味|污水|mold smell|musty|sewage|菸味|寵物臭/i],
    agendaId: "q_odor",
    probeEn: "Which room is the smell strongest in? Still noticeable with windows open?",
  },
  {
    id: "rf_soft_floor",
    patterns: [/地板鬆|門窗卡|卡住|soft floor|settling|門卡住|沉降/i],
    agendaId: "q_water_damage",
    probeEn: "Which floor area feels soft, or which door/window sticks? Photo that spot if you can.",
  },
  {
    id: "rf_water_stain",
    patterns: [/水漬|水痕|滲|漏水|stain|leak|damp|壁癌/i],
    agendaId: "q_water_damage",
    probeEn: "Ceiling, window edge, balcony, or parking — where is the stain? Active drip or old mark?",
  },
  {
    id: "rf_pressure_sign",
    patterns: [/放棄驗屋|今天就簽|不看文件|waive inspection|sign today|別驗屋/i],
    agendaId: "q_ask",
    probeEn: "Note this pressure as a risk. What exactly are they asking you to skip?",
  },
  {
    id: "rf_illegal_unit",
    patterns: [/違建|未許可|illegal|unpermitted|隔間套房|無照/i],
    agendaId: "q_ask",
    probeEn: "What was added without permit, and did the agent confirm it in writing?",
  },
];

export function inferAgendaMarket(address: string): AgendaMarket {
  const a = address.trim();
  if (
    /台灣|臺灣|台北|臺北|新北|台中|臺中|高雄|台南|臺南|桃園|新竹|Taiwan|Taipei|Kaohsiung|Taichung|\bTW\b/i.test(
      a,
    )
  ) {
    return "TW";
  }
  if (
    /Canada|Canadian|Vancouver|Burnaby|Richmond|Toronto|Montreal|Ottawa|Calgary|Edmonton|British Columbia|\bBC\b|Ontario|\bON\b|Alberta|\bAB\b|Québec|Quebec/i.test(
      a,
    )
  ) {
    return "CA";
  }
  if (
    /United States|\bUSA\b|\bU\.S\./i.test(a) ||
    /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|DC)\s+\d{5}/i.test(
      a,
    ) ||
    /,\s*(CA|WA|NY|TX|FL|IL|MA|OR|CO|AZ|NV|GA|NC|PA|NJ|VA|MD|DC)\b/i.test(a)
  ) {
    return "US";
  }
  return "OTHER";
}

export function resolveAgendaId(id: string): string {
  return AGENDA_ID_ALIASES[id] ?? id;
}

export function listAgendaSeedsForMarket(market: AgendaMarket): AgendaSeedDef[] {
  const pack =
    market === "US" || market === "CA" || market === "TW"
      ? MARKET_PACK_SEEDS[market]
      : [];
  return [...UNIVERSAL_AGENDA_SEEDS, ...pack].sort((a, b) => a.order - b.order);
}

export function matchRedFlags(text: string): RedFlagRule[] {
  const hits: RedFlagRule[] = [];
  for (const rule of RED_FLAG_RULES) {
    if (rule.patterns.some((re) => re.test(text))) hits.push(rule);
  }
  return hits;
}
