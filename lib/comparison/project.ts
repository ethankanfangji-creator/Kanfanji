import { isDecisionSummarySnapshot } from "@/lib/share-card";
import type {
  CompareFieldSet,
  CompareViewingInput,
  ComparisonColumn,
} from "./types";

function strOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

function numRating(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  if (n < 1 || n > 5) return null;
  return n;
}

function textsFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && "text" in item) {
        const text = String((item as { text: unknown }).text ?? "").trim();
        const deleted = (item as { deleted?: boolean }).deleted;
        const selected = (item as { selected?: boolean }).selected;
        if (deleted) return "";
        if (selected === false) return "";
        return text;
      }
      return "";
    })
    .filter(Boolean);
}

/** Project a viewing into compare fields. Never invents values. */
export function projectCompareFields(viewing: CompareViewingInput): CompareFieldSet {
  const property = viewing.property ?? {};
  const summary = isDecisionSummarySnapshot(property.decisionSummary)
    ? property.decisionSummary
    : null;

  const priceLabel =
    strOrNull(summary?.priceLabel) ?? strOrNull(property.priceLabel) ?? null;
  const layoutLabel =
    strOrNull(summary?.layoutLabel) ?? strOrNull(property.layoutLabel) ?? null;
  const locationLabel =
    strOrNull(summary?.address) ?? strOrNull(viewing.address) ?? null;
  const areaLabel = strOrNull(property.areaLabel) ?? null;
  const managementFeeLabel = strOrNull(property.managementFeeLabel) ?? null;
  const overallRating =
    numRating(summary?.overallRating) ?? numRating(property.overallRating);

  const pros = summary
    ? textsFromUnknown(summary.pros)
    : (viewing.pros ?? []).map((t) => t.trim()).filter(Boolean);
  const risks = summary
    ? textsFromUnknown(summary.risks)
    : (viewing.risks ?? []).map((t) => t.trim()).filter(Boolean);
  let followUps = summary ? textsFromUnknown(summary.followUps) : [];
  if (followUps.length === 0 && viewing.questions?.length) {
    followUps = viewing.questions
      .filter((q) => !q.checked || !q.answer)
      .map((q) => q.text.trim())
      .filter(Boolean);
  }

  return {
    priceLabel,
    layoutLabel,
    locationLabel,
    areaLabel,
    managementFeeLabel,
    overallRating,
    pros,
    risks,
    followUps,
  };
}

export function projectComparisonColumn(viewing: CompareViewingInput): ComparisonColumn {
  const fields = projectCompareFields(viewing);
  return {
    id: `col_${viewing.id}`,
    source: {
      viewingId: viewing.id,
      sourceUpdatedAt: viewing.updated_at,
    },
    title: fields.locationLabel || viewing.address || viewing.id,
    fields,
    notes: "",
    included: true,
  };
}

export function displayOrEmpty(value: string | null | undefined, emptyLabel: string): string {
  const t = (value ?? "").trim();
  return t ? t : emptyLabel;
}

export function listOrEmpty(items: string[] | undefined, emptyLabel: string): string[] {
  const list = (items ?? []).map((t) => t.trim()).filter(Boolean);
  return list.length ? list : [emptyLabel];
}
