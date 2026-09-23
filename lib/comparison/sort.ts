import type {
  CompareSortDirection,
  CompareSortKey,
  ComparisonColumn,
} from "./types";

/** Parse a loose price label into a number for sorting; null if unknown. */
export function parsePriceForSort(label: string | null): number | null {
  if (!label?.trim()) return null;
  const raw = label.trim().toLowerCase().replace(/,/g, "");
  const match = raw.match(/(\d+(\.\d+)?)\s*(k|m|萬|千)?/);
  if (!match) return null;
  let n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  const unit = match[3];
  if (unit === "k" || unit === "千") n *= 1_000;
  if (unit === "m") n *= 1_000_000;
  if (unit === "萬") n *= 10_000;
  return n;
}

function sortValue(
  column: ComparisonColumn,
  key: CompareSortKey,
): number | null {
  if (key === "price") return parsePriceForSort(column.fields.priceLabel);
  if (key === "rating") return column.fields.overallRating;
  return column.fields.risks.length;
}

/**
 * Sort columns. Missing values always sink to the end (both asc and desc),
 * so we never treat 未提供 as 0.
 */
export function sortComparisonColumns(
  columns: ComparisonColumn[],
  key: CompareSortKey,
  direction: CompareSortDirection,
): ComparisonColumn[] {
  const indexed = columns.map((column, index) => ({ column, index }));
  indexed.sort((a, b) => {
    const av = sortValue(a.column, key);
    const bv = sortValue(b.column, key);
    const aMissing = av == null;
    const bMissing = bv == null;
    if (aMissing && bMissing) return a.index - b.index;
    if (aMissing) return 1;
    if (bMissing) return -1;
    const diff = av - bv;
    if (diff === 0) return a.index - b.index;
    return direction === "asc" ? diff : -diff;
  });
  return indexed.map((row) => row.column);
}
