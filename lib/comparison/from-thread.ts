/**
 * Project a local viewing-chat thread into a read-only compare column.
 *
 * Threads live only in this browser's localStorage. There is no server row
 * to authorize, so this function never fetches and never checks ownership.
 * Another browser opening the same URL simply has no matching thread.
 */

import { shortenAddressLabel } from "@/lib/shorten-address";
import type { ViewingChatThread } from "@/lib/viewing-chat/types";
import { formatValue } from "@/lib/viewing-chat/collection/format-value";
import type { PropertyFieldState } from "@/lib/viewing-chat/collection/types";
import type { PropertyIntelBasic } from "@/lib/property-intel/types";

export const COMPARE_LITE_MAX = 3;

export type CompareProvenance =
  | "confirmed"
  | "inferred"
  | "corrected"
  | "intel"
  | "report";

export type CompareCell = {
  /** Null means the UI shows an em dash. */
  text: string | null;
  /** Multi-value rows (schools, pros, cons, risk tags). */
  list?: string[];
  provenance?: CompareProvenance;
  /** User deferred this collection field. UI shows an em dash plus「已跳過」. */
  skipped?: boolean;
};

export type CompareRowKey =
  | "address"
  | "viewedAt"
  | "price"
  | "area"
  | "layout"
  | "floor"
  | "yearBuilt"
  | "propertyType"
  | "strata"
  | "transit"
  | "schools"
  | "supermarket"
  | "park"
  | "parking"
  | "noise"
  | "odor"
  | "light"
  | "water_damage"
  | "electrical"
  | "plumbing"
  | "hvac"
  | "pros"
  | "cons"
  | "intelRiskTags";

export type CompareSectionId =
  | "basic"
  | "nearby"
  | "feel"
  | "condition"
  | "notes";

export const COMPARE_SECTION_ROWS: Array<{
  id: CompareSectionId;
  rows: CompareRowKey[];
}> = [
  {
    id: "basic",
    rows: [
      "address",
      "viewedAt",
      "price",
      "layout",
      "area",
      "floor",
      "yearBuilt",
      "propertyType",
      "strata",
    ],
  },
  {
    id: "nearby",
    rows: ["transit", "schools", "supermarket", "park", "parking"],
  },
  {
    id: "feel",
    rows: ["noise", "odor", "light"],
  },
  {
    id: "condition",
    rows: ["water_damage", "electrical", "plumbing", "hvac"],
  },
  {
    id: "notes",
    rows: ["pros", "cons", "intelRiskTags"],
  },
];

export const COMPARE_ROW_KEYS: CompareRowKey[] = COMPARE_SECTION_ROWS.flatMap(
  (section) => section.rows,
);

/** These rows stay on screen even when every column is blank. */
export const ALWAYS_VISIBLE_COMPARE_ROWS: readonly CompareRowKey[] = [
  "address",
  "price",
  "layout",
  "area",
];

export type ThreadCompareColumn = {
  threadId: string;
  /** Short label for cards and table headers. */
  title: string;
  rows: Record<CompareRowKey, CompareCell>;
};

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Comma-separated ids: trim, drop invalid tokens, dedupe, keep the first 3. */
export function parseCompareIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length === COMPARE_LITE_MAX) break;
  }
  return ids;
}

/**
 * Fold width and case, then drop whitespace so「3房2廳」and「3 房 2 廳」match.
 */
export function normalizeCompareText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function comparableValue(cell: CompareCell): string | null {
  if (cell.list && cell.list.length > 0) {
    return cell.list.map((item) => normalizeCompareText(item)).sort().join("\n");
  }
  if (cell.text == null || cell.text.trim() === "") return null;
  return normalizeCompareText(cell.text);
}

/** True when at least two non-empty cells disagree after normalization. */
export function rowDiffers(cells: CompareCell[]): boolean {
  const values = cells
    .map((cell) => comparableValue(cell))
    .filter((value): value is string => value != null);
  if (values.length < 2) return false;
  return values.some((value) => value !== values[0]);
}

export function isCompareCellBlank(cell: CompareCell | undefined): boolean {
  if (!cell) return true;
  if (cell.skipped) return false;
  if (cell.list && cell.list.length > 0) return false;
  return cell.text == null || cell.text.trim() === "";
}

export function compareRowIsVisible(
  key: CompareRowKey,
  columns: ThreadCompareColumn[],
): boolean {
  if (ALWAYS_VISIBLE_COMPARE_ROWS.includes(key)) return true;
  return columns.some((column) => !isCompareCellBlank(column.rows[key]));
}

function blankRows(): Record<CompareRowKey, CompareCell> {
  const rows = {} as Record<CompareRowKey, CompareCell>;
  for (const key of COMPARE_ROW_KEYS) rows[key] = { text: null };
  return rows;
}

function fieldState(
  thread: ViewingChatThread,
  fieldId: string,
): PropertyFieldState | undefined {
  return thread.propertyRecord?.fields?.[fieldId];
}

function readField(thread: ViewingChatThread, fieldId: string): CompareCell {
  if (thread.collectionSkippedFields?.includes(fieldId)) {
    return { text: null, skipped: true };
  }
  const field = fieldState(thread, fieldId);
  if (!field || field.status === "unknown") return { text: null };
  const text = formatValue(field.value) || (field.rawText ?? "").trim();
  if (!text) return { text: null };
  const provenance =
    field.status === "inferred" ||
    field.status === "corrected" ||
    field.status === "confirmed"
      ? field.status
      : undefined;
  return { text, provenance };
}

function asList(cell: CompareCell): CompareCell {
  if (cell.skipped || cell.text == null) return cell;
  const list = cell.text
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (list.length === 0) return { text: null };
  return { text: null, list, provenance: cell.provenance };
}

function reportList(items: string[] | undefined): CompareCell | null {
  const list = (items ?? []).map((item) => item.trim()).filter(Boolean);
  if (list.length === 0) return null;
  return { text: null, list, provenance: "report" };
}

function stringList(items: string[] | undefined): CompareCell {
  const list = (items ?? []).map((item) => item.trim()).filter(Boolean);
  if (list.length === 0) return { text: null };
  return { text: null, list, provenance: "intel" };
}

function intelText(value: string | number | null | undefined): CompareCell {
  if (value == null) return { text: null };
  const text = formatValue(value).trim();
  if (!text) return { text: null };
  return { text, provenance: "intel" };
}

function preferField(
  fieldCell: CompareCell,
  fallback: CompareCell,
): CompareCell {
  if (fieldCell.skipped || fieldCell.text != null || (fieldCell.list && fieldCell.list.length > 0)) {
    return fieldCell;
  }
  return fallback;
}

function layoutFromIntel(basic: PropertyIntelBasic | undefined): CompareCell {
  if (!basic) return { text: null };
  const parts: string[] = [];
  if (basic.beds != null) parts.push(`${basic.beds} 房`);
  if (basic.baths != null) parts.push(`${basic.baths} 衛`);
  if (parts.length === 0) return { text: null };
  return { text: parts.join(" "), provenance: "intel" };
}

function transitFromIntel(thread: ViewingChatThread): CompareCell {
  const location = thread.metadata?.location;
  if (!location) return { text: null };
  const parts = [location.skytrain, location.bus]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean);
  if (parts.length === 0) return { text: null };
  return { text: parts.join(" · "), provenance: "intel" };
}

/** Local date/time, same fields as the cloud viewings list. */
export function formatViewedAt(iso: string, locale = "zh-Hant"): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const intl = locale === "en" ? "en-CA" : locale === "th" ? "th-TH" : "zh-TW";
  return new Intl.DateTimeFormat(intl, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function projectThreadForCompare(
  thread: ViewingChatThread,
  options?: { locale?: string },
): ThreadCompareColumn {
  const locale = options?.locale ?? "zh-Hant";
  const rows = blankRows();
  const fullAddress = (thread.normalizedAddress || thread.address || "").trim();

  rows.address = fullAddress ? { text: fullAddress } : { text: null };
  rows.viewedAt = { text: formatViewedAt(thread.createdAt, locale) };
  rows.price = readField(thread, "price");
  rows.area = preferField(readField(thread, "area"), intelText(thread.metadata?.basic.area));
  rows.layout = preferField(readField(thread, "layout"), layoutFromIntel(thread.metadata?.basic));
  rows.floor = readField(thread, "floor");
  rows.yearBuilt = preferField(
    readField(thread, "year_built"),
    intelText(thread.metadata?.basic.year),
  );
  rows.propertyType = intelText(thread.metadata?.basic.type);
  rows.strata = intelText(thread.metadata?.history.strata);
  rows.transit = preferField(readField(thread, "transit"), transitFromIntel(thread));
  rows.schools = stringList(thread.metadata?.location.schools);
  rows.supermarket = intelText(thread.metadata?.location.supermarket);
  rows.park = intelText(thread.metadata?.location.park);
  rows.parking = readField(thread, "parking");
  rows.noise = readField(thread, "noise");
  rows.odor = readField(thread, "odor");
  rows.light = readField(thread, "light");
  rows.water_damage = readField(thread, "water_damage");
  rows.electrical = readField(thread, "electrical");
  rows.plumbing = readField(thread, "plumbing");
  rows.hvac = readField(thread, "hvac");
  rows.pros = reportList(thread.report?.pros) ?? asList(readField(thread, "pros"));
  rows.cons = reportList(thread.report?.risks) ?? asList(readField(thread, "cons"));
  rows.intelRiskTags = stringList(thread.metadata?.risks);

  return {
    threadId: thread.id,
    title: shortenAddressLabel(fullAddress),
    rows,
  };
}
