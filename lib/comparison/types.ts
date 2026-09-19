/** Multi-viewing comparison — editable copy, never mutates source viewings. */

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 5;

export type CompareSortKey = "price" | "rating" | "riskCount";
export type CompareSortDirection = "asc" | "desc";

export type CompareSourceRef = {
  viewingId: string;
  sourceUpdatedAt: string;
};

/** All scalar fields nullable = 未提供. Arrays empty = 未提供 in UI. */
export type CompareFieldSet = {
  priceLabel: string | null;
  layoutLabel: string | null;
  locationLabel: string | null;
  areaLabel: string | null;
  managementFeeLabel: string | null;
  overallRating: number | null;
  pros: string[];
  risks: string[];
  followUps: string[];
};

export type ComparisonColumn = {
  id: string;
  source: CompareSourceRef;
  title: string;
  fields: CompareFieldSet;
  notes: string;
  included: boolean;
};

export type ComparisonDraft = {
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  columns: ComparisonColumn[];
  sort: {
    key: CompareSortKey;
    direction: CompareSortDirection;
  };
  shareToken: string | null;
};

export type ComparisonShareSnapshot = {
  version: 1;
  id: string;
  updatedAt: string;
  sort: ComparisonDraft["sort"];
  columns: ComparisonColumn[];
};

/** Minimal viewing-shaped input for projection (no side effects). */
export type CompareViewingInput = {
  id: string;
  address: string;
  updated_at: string;
  pros?: string[] | null;
  risks?: string[] | null;
  questions?: Array<{ text: string; checked?: boolean; answer?: string }> | null;
  property?: Record<string, unknown> | null;
};
