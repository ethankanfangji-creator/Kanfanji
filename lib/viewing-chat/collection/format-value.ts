/**
 * Display string for a collected field value.
 * Ten-thousands that divide evenly are shown as「萬」; everything else is the raw value.
 */
export function formatValue(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && value >= 10_000 && value % 10_000 === 0) {
    return `${value / 10_000}萬`;
  }
  return String(value);
}
