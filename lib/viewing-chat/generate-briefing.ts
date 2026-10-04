import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import {
  aiOutputLanguageInstruction,
  resolveAiLocale,
} from "@/lib/ai-boundary/locale";
import type { BriefingFoundFact } from "@/lib/viewing-chat/briefing-facts";
// Types only — do not import runtime helpers from briefing.ts (Turbopack circular
// eval leaves clampBriefingSummary undefined inside this route module).
import type { ViewingBriefing, ViewingBriefingPoint } from "@/lib/viewing-chat/briefing";

const SUMMARY_MAX_CHARS = 600;

function clampBriefingSummary(text: string, maxChars = SUMMARY_MAX_CHARS): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  const sliced = cleaned.slice(0, maxChars);
  const lastStop = Math.max(sliced.lastIndexOf("。"), sliced.lastIndexOf(". "), sliced.lastIndexOf("！"));
  if (lastStop > maxChars * 0.5) return sliced.slice(0, lastStop + 1).trim();
  return `${sliced.trim()}…`;
}

function dedupeBriefingSources(values: string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const source = raw.trim();
    if (!source) continue;
    if (out.some((existing) => existing.toLowerCase() === source.toLowerCase())) continue;
    out.push(source.slice(0, 120));
  }
  return out;
}

function summaryFromPoints(points: ViewingBriefingPoint[]): string {
  return points
    .map((point) => point.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourcesFromPoints(points: ViewingBriefingPoint[]): string[] {
  return dedupeBriefingSources(points.map((point) => point.source));
}

function readBriefingPrompt(locale: string): string {
  const text = readFileSync(path.join(process.cwd(), "prompts", "briefing.md"), "utf8").trim();
  return `${text}\n\n${aiOutputLanguageInstruction(resolveAiLocale(locale))}`;
}

const MAX_POINTS = 8;
const MAX_LIFESTYLE = 2;
const ALLOWED_SOURCE_FALLBACK = "公開網頁";

const PROPERTY_FACT_PRIORITY = [
  "listing.",
  "identity.doorplate",
  "identity.displayAddress",
  "identity.streetName",
  "identity.city",
  "identity.postalCode",
  "building.",
  "hoa.",
  "parcel.",
  "zoning.",
  "market.",
  "risk.",
  "transit.rail",
  "transit.bus",
  "poi.park",
  "poi.supermarket",
  "poi.schools",
  "visuals.streetView",
];

const VAGUE_LIFESTYLE =
  /生活機能完善|適合家庭|藝術之城|交通便利(?!.*(?:分|分鐘|min))|發展潛力|社區氛圍|都市生活/i;

const EMPTY_PROPERTY_META =
  /無法找到|查無|找不到.*房源|no (public )?listing|not found|no information/i;

const WALK_DISTANCE = /步行|分鐘|\d+\s*min|walk|公尺|米|m\b/i;

const PROPERTY_SIGNAL =
  /房|臥|卫|衛|浴|sqft|平方|坪|strata|管理費|屋齡|建成|年建|bedroom|bath|索價|售價|\$|聯排|townhouse|condo|公寓|型態/i;

type UrlCitation = {
  type?: string;
  url?: string;
  title?: string;
};

export type BriefingPointLayer = "property" | "lifestyle" | "unknown";

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fence?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no_json");
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0]?.slice(0, 80) || ALLOWED_SOURCE_FALLBACK;
  }
}

function citationHostnames(annotations: UrlCitation[]): string[] {
  const hosts: string[] = [];
  for (const row of annotations) {
    if (row.type && row.type !== "url_citation") continue;
    if (!row.url) continue;
    const host = hostnameFromUrl(row.url);
    if (host && !hosts.includes(host)) hosts.push(host);
  }
  return hosts;
}

function normalizeSource(raw: string, citationHosts: string[]): string {
  const source = raw.trim();
  if (!source) {
    return citationHosts[0] || ALLOWED_SOURCE_FALLBACK;
  }
  if (/^turn\d+search\d+$/i.test(source) || /^search\d+$/i.test(source)) {
    return citationHosts[0] || ALLOWED_SOURCE_FALLBACK;
  }
  if (/^https?:\/\//i.test(source)) {
    return hostnameFromUrl(source);
  }
  return source.slice(0, 120);
}

/** Strip markdown links from tip text; return first linked hostname if any. */
export function cleanBriefingText(text: string): { text: string; linkedHost?: string } {
  let linkedHost: string | undefined;
  const withoutLinks = text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_full, label: string, url: string) => {
      if (!linkedHost) linkedHost = hostnameFromUrl(url);
      return label;
    })
    .replace(/\s*\(\s*https?:\/\/[^)]+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { text: withoutLinks, linkedHost };
}

export function classifyBriefingLayer(
  text: string,
  layerHint?: string,
): BriefingPointLayer {
  if (layerHint === "property" || layerHint === "lifestyle") return layerHint;
  if (PROPERTY_SIGNAL.test(text)) return "property";
  if (WALK_DISTANCE.test(text)) return "lifestyle";
  return "unknown";
}

/** Drop vague tourism / neighbor-doorplate padding. */
export function shouldKeepBriefingPoint(
  text: string,
  doorplate: string,
): boolean {
  if (!text.trim()) return false;
  if (VAGUE_LIFESTYLE.test(text) && !WALK_DISTANCE.test(text)) return false;
  if (EMPTY_PROPERTY_META.test(text) && !PROPERTY_SIGNAL.test(text)) return false;
  if (doorplate) {
    // Other street addresses like "2137 Spring Street … 4房" — ignore "352 sqft".
    const neighborDoor = [
      ...text.matchAll(
        /\b(\d{3,5})\s+([A-Za-z][A-Za-z.'-]*|街|路|大道|巷)\b/g,
      ),
    ].filter((match) => {
      const token = (match[2] ?? "").toLowerCase();
      return !/^(sqft|sf|m2|km|min|mins|bed|beds|bath|baths|yr|year|years)$/i.test(
        token,
      );
    });
    if (neighborDoor.length && PROPERTY_SIGNAL.test(text)) {
      const onlyOthers = neighborDoor.every((match) => match[1] !== doorplate);
      if (onlyOthers) return false;
    }
  }
  return true;
}

export function filterLayeredBriefingPoints(
  points: Array<ViewingBriefingPoint & { layer?: BriefingPointLayer }>,
  doorplate: string,
): ViewingBriefingPoint[] {
  const kept: ViewingBriefingPoint[] = [];
  let lifestyleCount = 0;
  for (const point of points) {
    if (!shouldKeepBriefingPoint(point.text, doorplate)) continue;
    const layer = classifyBriefingLayer(point.text, point.layer);
    if (layer === "lifestyle") {
      if (lifestyleCount >= MAX_LIFESTYLE) continue;
      if (!WALK_DISTANCE.test(point.text)) continue;
      lifestyleCount += 1;
    } else if (layer === "unknown") {
      // Keep only if it still looks grounded (walk distance or property signal).
      if (!WALK_DISTANCE.test(point.text) && !PROPERTY_SIGNAL.test(point.text)) continue;
      if (WALK_DISTANCE.test(point.text) && !PROPERTY_SIGNAL.test(point.text)) {
        if (lifestyleCount >= MAX_LIFESTYLE) continue;
        lifestyleCount += 1;
      }
    }
    kept.push({ text: point.text, source: point.source });
    if (kept.length >= MAX_POINTS) break;
  }
  return kept;
}

/** Build summary + sources from model JSON (summary preferred; points as fallback). */
export function buildBriefingProse(args: {
  parsed: Record<string, unknown>;
  citationHosts?: string[];
  doorplate?: string;
}): { summary: string; sources: string[]; points: ViewingBriefingPoint[] } {
  const citationHosts = args.citationHosts ?? [];
  const doorplate = args.doorplate ?? "";
  let summary =
    typeof args.parsed.summary === "string" ? clampBriefingSummary(args.parsed.summary) : "";
  const sourceList = Array.isArray(args.parsed.sources)
    ? dedupeBriefingSources(
        (args.parsed.sources as unknown[]).filter((s): s is string => typeof s === "string"),
      )
    : [];
  const parsedPoints = parseBriefingPoints(args.parsed.points, citationHosts);
  const points = filterLayeredBriefingPoints(parsedPoints, doorplate);

  if (!summary && points.length) {
    summary = clampBriefingSummary(summaryFromPoints(points));
  }
  // Strip accidental markdown list markers if the model ignored prose rules.
  summary = summary
    .replace(/(?:^|\n)\s*[-*•]\s+/g, " ")
    .replace(/(?:^|\n)\s*\d+[.)]\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const sources = sourceList.length
    ? sourceList
    : dedupeBriefingSources([...sourcesFromPoints(points), ...citationHosts]);

  return { summary, sources, points };
}

function scrubBriefingProse(text: string): string {
  return text
    .replace(/(?:^|\n)\s*[-*•]\s+/g, " ")
    .replace(/(?:^|\n)\s*\d+[.)]\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Prefer JSON summary; if empty, fall back to web-research memo so sparse
 * doorplates still get a usable intro instead of openai_empty.
 */
export function finalizeBriefingSummary(args: {
  summary: string;
  researchText?: string;
  citationHosts?: string[];
  sources?: string[];
}): { summary: string; sources: string[]; usedResearchFallback: boolean } {
  const citationHosts = args.citationHosts ?? [];
  let summary = scrubBriefingProse(args.summary || "");
  let usedResearchFallback = false;
  if (!summary) {
    const fromResearch = scrubBriefingProse(args.researchText || "");
    if (fromResearch) {
      summary = clampBriefingSummary(fromResearch);
      usedResearchFallback = true;
    }
  } else {
    summary = clampBriefingSummary(summary);
  }

  let sources = dedupeBriefingSources(args.sources ?? []);
  if (!sources.length && summary) {
    sources = dedupeBriefingSources(
      citationHosts.length ? citationHosts : [ALLOWED_SOURCE_FALLBACK],
    );
  }
  return { summary, sources, usedResearchFallback };
}

export function parseBriefingPoints(
  raw: unknown,
  citationHosts: string[] = [],
): Array<ViewingBriefingPoint & { layer?: BriefingPointLayer }> {
  if (!Array.isArray(raw)) return [];
  const points: Array<ViewingBriefingPoint & { layer?: BriefingPointLayer }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const textRaw =
      typeof (item as { text?: unknown }).text === "string"
        ? (item as { text: string }).text.trim()
        : "";
    const sourceRaw =
      typeof (item as { source?: unknown }).source === "string"
        ? (item as { source: string }).source
        : "";
    const layerRaw =
      typeof (item as { layer?: unknown }).layer === "string"
        ? (item as { layer: string }).layer
        : undefined;
    if (!textRaw) continue;
    const { text, linkedHost } = cleanBriefingText(textRaw);
    if (!text) continue;
    points.push({
      text: text.slice(0, 280),
      source: linkedHost || normalizeSource(sourceRaw, citationHosts),
      layer: classifyBriefingLayer(text, layerRaw),
    });
    if (points.length >= MAX_POINTS + 4) break;
  }
  return points;
}

function collectAnnotations(output: unknown): UrlCitation[] {
  if (!Array.isArray(output)) return [];
  const annotations: UrlCitation[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const row = item as { type?: string; content?: unknown };
    if (row.type !== "message" || !Array.isArray(row.content)) continue;
    for (const part of row.content) {
      if (!part || typeof part !== "object") continue;
      const ann = (part as { annotations?: unknown }).annotations;
      if (!Array.isArray(ann)) continue;
      for (const a of ann) {
        if (a && typeof a === "object") annotations.push(a as UrlCitation);
      }
    }
  }
  return annotations;
}

export function prioritizePropertyFacts(facts: BriefingFoundFact[], limit = 14): BriefingFoundFact[] {
  const scored = facts.map((fact, index) => {
    const rank = PROPERTY_FACT_PRIORITY.findIndex(
      (prefix) => fact.field === prefix || fact.field.startsWith(prefix),
    );
    return { fact, rank: rank === -1 ? 100 + index : rank, index };
  });
  scored.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return scored.slice(0, limit).map((row) => row.fact);
}

function factValue(facts: BriefingFoundFact[], field: string): string {
  return facts.find((f) => f.field === field)?.value?.trim() || "";
}

function buildResearchBrief(args: {
  address: string;
  facts: BriefingFoundFact[];
  listingFacts: BriefingFoundFact[];
  listingUrl?: string | null;
}): string {
  const doorplate = factValue(args.facts, "identity.doorplate");
  const postal = factValue(args.facts, "identity.postalCode");
  const city = factValue(args.facts, "identity.city");
  const street = factValue(args.facts, "identity.streetName");
  const display = factValue(args.facts, "identity.displayAddress") || args.address;

  return [
    `Target address (THIS doorplate only): ${display}`,
    doorplate ? `Doorplate: ${doorplate}` : "",
    street ? `Street: ${street}` : "",
    city ? `City: ${city}` : "",
    postal ? `Postal: ${postal}` : "",
    args.listingUrl ? `Listing URL: ${args.listingUrl}` : "Listing URL: (none)",
    args.listingFacts.length
      ? `LISTING_FACTS already extracted:\n${JSON.stringify(args.listingFacts)}`
      : "LISTING_FACTS: []",
    "",
    "Search ONLY for THIS exact address + realtor.ca / BC Assessment / strata / year built / beds.",
    "Do NOT research neighboring doorplates as substitutes for this unit.",
    "Also note 1–2 walk-distance lifestyle facts if found (park, SkyTrain, grocery) with minutes.",
    "Write a compact research memo. If this doorplate has no listing fields, say so — do not invent from neighbors.",
  ]
    .filter(Boolean)
    .join("\n");
}

export type BriefingFailureCode =
  | "openai_connection"
  | "openai_timeout"
  | "openai_empty"
  | "openai_upstream";

/** Typed OpenAI briefing failure — route maps to 502/504 + code (never silent 200 empty). */
export class BriefingGenerateError extends Error {
  readonly code: BriefingFailureCode;
  readonly status: 502 | 504;

  constructor(code: BriefingFailureCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "BriefingGenerateError";
    this.code = code;
    this.status = code === "openai_timeout" ? 504 : 502;
  }
}

/** Duck-type guard — Turbopack can break `instanceof` across module copies. */
export function isBriefingGenerateError(error: unknown): error is BriefingGenerateError {
  if (!error || typeof error !== "object") return false;
  const row = error as { name?: unknown; code?: unknown; status?: unknown };
  return (
    row.name === "BriefingGenerateError" &&
    typeof row.code === "string" &&
    (row.status === 502 || row.status === 504)
  );
}

export function classifyOpenAiBriefingError(error: unknown): BriefingFailureCode {
  if (!error || typeof error !== "object") return "openai_upstream";
  const err = error as {
    name?: string;
    message?: string;
    code?: string | number;
    cause?: unknown;
  };
  const message = String(err.message ?? "");
  const causeText = err.cause instanceof Error ? err.cause.message : String(err.cause ?? "");
  const hay = `${err.name ?? ""} ${message} ${causeText} ${String(err.code ?? "")}`;

  if (
    err.name === "AbortError" ||
    err.name === "TimeoutError" ||
    /timed?\s*out/i.test(hay) ||
    err.code === "ETIMEDOUT"
  ) {
    return "openai_timeout";
  }
  if (
    err.name === "APIConnectionError" ||
    /connection error/i.test(hay) ||
    /EAI_AGAIN|ENOTFOUND|ECONNRESET|ECONNREFUSED|fetch failed/i.test(hay)
  ) {
    return "openai_connection";
  }
  return "openai_upstream";
}

/**
 * Address briefing via OpenAI web_search + optional listing extract.
 * Property layer primary; lifestyle (walk-distance) secondary (max 2).
 * Throws BriefingGenerateError on OpenAI failure or empty model output.
 */
export async function generateAddressBriefing(args: {
  address: string;
  locale: string;
  facts: BriefingFoundFact[];
  listingFacts?: BriefingFoundFact[];
  listingUrl?: string | null;
  sourcesQueried: string[];
  apiKey: string;
  signal?: AbortSignal;
}): Promise<ViewingBriefing> {
  const { address, locale, facts, apiKey, signal } = args;
  const listingFacts = args.listingFacts ?? [];
  const listingUrl = args.listingUrl?.trim() || null;
  const sourcesQueried = [
    ...args.sourcesQueried,
    "openai_web_search",
    ...(listingFacts.length ? ["listing_url_extract"] : listingUrl ? ["listing_url_attempted"] : []),
  ];
  const propertyFacts = prioritizePropertyFacts(facts);
  const doorplate = factValue(facts, "identity.doorplate");

  try {
    const openai = new OpenAI({ apiKey });
    const system = readBriefingPrompt(locale);

    const research = await openai.responses.create(
      {
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_output_tokens: 1600,
        tools: [{ type: "web_search" }],
        instructions:
          "Research ONE doorplate for a homebuyer briefing. Prefer that unit's listing/assessment fields. Allow 1–2 walk-distance lifestyle notes. Never substitute neighbor doorplates for this unit's beds/baths/price.",
        input: buildResearchBrief({
          address,
          facts: propertyFacts,
          listingFacts,
          listingUrl,
        }),
      },
      { signal },
    );

    const researchText = research.output_text?.trim() || "";
    const citationHosts = citationHostnames(collectAnnotations(research.output));
    const citationBlock =
      citationHosts.length > 0
        ? `Known source hosts from search: ${citationHosts.join(", ")}`
        : "";

    const listingBlock =
      listingFacts.length > 0
        ? `LISTING_FACTS (PRIMARY — this unit):\n${JSON.stringify(listingFacts, null, 0)}`
        : "LISTING_FACTS: [] (no pasted listing extract — do not invent beds/baths/price from neighbors)";

    const factsBlock =
      propertyFacts.length > 0
        ? `FOUND_FACTS (lifestyle walk-times + identity):\n${JSON.stringify(propertyFacts, null, 0)}`
        : "FOUND_FACTS: []";

    const structured = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0.25,
        response_format: { type: "json_object" },
        max_tokens: 1100,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Address: ${address}
locale: ${locale}
doorplate: ${doorplate || "(unknown)"}
listingUrl: ${listingUrl || "(none)"}

${listingBlock}

WEB_RESEARCH:
${researchText || "(empty)"}

${citationBlock}

${factsBlock}

Return JSON only:
{"summary":"one connected paragraph 120-220 words/chars, not a bullet list","sources":["hostname",...]}
summary MUST be a non-empty string. If LISTING_FACTS is empty, still write from WEB_RESEARCH + FOUND_FACTS (address identity + up to 2 walk-minute lifestyle notes). Never return {"summary":""}.
Weave THIS doorplate / LISTING_FACTS first, then 1–2 walk-minute lifestyle facts. No bullets, no neighbor doorplates.`,
          },
        ],
      },
      { signal },
    );

    const raw = structured.choices[0]?.message?.content?.trim() || "{}";
    let summary = "";
    let sources: string[] = [];
    let points: ViewingBriefingPoint[] = [];
    try {
      const parsed = extractJsonObject(raw) as Record<string, unknown>;
      const built = buildBriefingProse({ parsed, citationHosts, doorplate });
      summary = built.summary;
      sources = built.sources;
      points = built.points;
    } catch {
      summary = "";
      sources = [];
      points = [];
    }

    const finalized = finalizeBriefingSummary({
      summary,
      researchText,
      citationHosts,
      sources,
    });
    summary = finalized.summary;
    sources = finalized.sources;

    if (!summary) {
      console.error("[generateAddressBriefing] empty output", address, {
        researchPreview: researchText.slice(0, 400),
        rawPreview: raw.slice(0, 400),
      });
      throw new BriefingGenerateError(
        "openai_empty",
        "OpenAI returned no usable briefing summary",
      );
    }

    return {
      address,
      listingUrl,
      summary,
      points,
      sources,
      sourcesQueried: [...new Set(sourcesQueried)],
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof BriefingGenerateError) {
      console.error("[generateAddressBriefing]", address, error.code, error.message);
      throw error;
    }
    const code = classifyOpenAiBriefingError(error);
    console.error("[generateAddressBriefing]", address, code, error);
    throw new BriefingGenerateError(code, error instanceof Error ? error.message : String(error), {
      cause: error,
    });
  }
}
