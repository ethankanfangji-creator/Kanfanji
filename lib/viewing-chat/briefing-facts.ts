import { buildStreetViewUrl } from "@/lib/property-intel/street-view";
import type { PropertyFactCard, ProvenancedField, SourceClass, SourceType } from "@/lib/property-facts/types";

export type BriefingFoundFact = {
  field: string;
  value: string;
  source: string;
};

const BLOCKED_SOURCE_TYPES = new Set<SourceType>([
  "listing_claim",
  "model_estimate",
  "area_statistic",
]);

const BLOCKED_SOURCE_CLASSES = new Set<SourceClass>(["model_estimate"]);

/** Fields that must never appear as invented money/MLS private listing claims. */
const SENSITIVE_MARKET_FIELDS = new Set([
  "listPrice",
  "askingPrice",
  "avgUnitPrice",
  "priceRange",
  "lastSold",
]);

/** Low-signal identity crumbs — keep street/city/postal, drop machine ids. */
const SKIP_FIELDS = new Set([
  "placeId",
  "lat",
  "lng",
  "countryCode",
  "currency",
  "normalizedAddress",
]);

function isProvenancedField(value: unknown): value is ProvenancedField<unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "status" in value &&
      "value" in value &&
      "sourceType" in value,
  );
}

function formatValue(value: unknown, unit: string | null): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return unit ? `${value} ${unit}`.trim() : String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object" && "name" in item) {
          const row = item as { name?: string; kind?: string; minutesWalk?: number | null };
          const walk =
            typeof row.minutesWalk === "number" ? `（步行約 ${row.minutesWalk} 分）` : "";
          return `${row.kind ? `${row.kind}: ` : ""}${row.name ?? ""}${walk}`.trim();
        }
        if (item && typeof item === "object" && "label" in item) {
          return String((item as { label: string }).label);
        }
        return typeof item === "string" || typeof item === "number" ? String(item) : "";
      })
      .filter(Boolean)
      .join("；");
  }
  if (typeof value === "object" && value && "label" in value) {
    return String((value as { label: string }).label);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function walkFound(
  node: unknown,
  path: string,
  out: BriefingFoundFact[],
) {
  if (!node || typeof node !== "object") return;
  if (isProvenancedField(node)) {
    if (node.status !== "found" || node.value == null || node.estimated) return;
    if (node.sourceType && BLOCKED_SOURCE_TYPES.has(node.sourceType)) return;
    if (node.sourceClass && BLOCKED_SOURCE_CLASSES.has(node.sourceClass)) return;
    const leaf = path.split(".").pop() ?? path;
    if (SKIP_FIELDS.has(leaf)) return;
    if (SENSITIVE_MARKET_FIELDS.has(leaf) && node.sourceType !== "official" && node.sourceType !== "public_record") {
      return;
    }
    const value = formatValue(node.value, node.unit);
    if (!value) return;
    const source = node.sourceLabel || node.sourceName || node.sourceId || "公開資料";
    out.push({ field: path, value: value.slice(0, 240), source });
    return;
  }
  for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
    if (key === "meta" || key === "publicWebEvidence" || key === "conflicts") continue;
    walkFound(child, path ? `${path}.${key}` : key, out);
  }
}

/**
 * Pull only already-found public facts for briefing.
 * Does not invent; MLS private / estimate / listing-claim values are skipped.
 */
export function extractBriefingFoundFacts(card: PropertyFactCard): {
  facts: BriefingFoundFact[];
  sourcesQueried: string[];
} {
  const facts: BriefingFoundFact[] = [];
  walkFound(card.identity, "identity", facts);
  walkFound(card.listing, "listing", facts);
  walkFound(card.parcel, "parcel", facts);
  walkFound(card.building, "building", facts);
  walkFound(card.hoa, "hoa", facts);
  walkFound(card.zoning, "zoning", facts);
  walkFound(card.poi, "poi", facts);
  walkFound(card.transit, "transit", facts);
  walkFound(card.risk, "risk", facts);
  walkFound(card.market, "market", facts);

  const lat = card.identity.lat.status === "found" ? card.identity.lat.value : null;
  const lng = card.identity.lng.status === "found" ? card.identity.lng.value : null;
  if (typeof lat === "number" && typeof lng === "number") {
    const streetView = buildStreetViewUrl(lat, lng);
    if (streetView) {
      facts.push({
        field: "visuals.streetView",
        value: "此座標可取得 Google 街景外觀圖",
        source: "Google Street View",
      });
    }
  }

  for (const evidence of card.publicWebEvidence.slice(0, 4)) {
    const text = typeof evidence.value === "string" ? evidence.value.trim() : "";
    if (!text) continue;
    facts.push({
      field: `publicWeb.${evidence.field}`,
      value: text.slice(0, 240),
      source: evidence.sourceLabel || "公開網頁",
    });
  }

  const sourcesQueried = [
    ...(card.meta.providersUsed ?? []).map((p) => p.id),
    ...(card.meta.providersSkipped ?? []).map((p) => `${p.id} (skipped: ${p.reason})`),
    ...card.meta.adapterRuns.map((run) => `${run.sourceId}:${run.ok ? "ok" : "fail"}`),
  ];
  if (card.meta.geocodeOk) sourcesQueried.unshift("geocoder");
  if (facts.some((f) => f.source === "Google Street View")) {
    sourcesQueried.push("Google Street View");
  }
  if (card.publicWebEvidence.length) sourcesQueried.push("public_web_evidence");

  // Deduplicate identical value+source pairs
  const seen = new Set<string>();
  const unique = facts.filter((fact) => {
    const key = `${fact.source}|${fact.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { facts: unique, sourcesQueried: [...new Set(sourcesQueried)] };
}
