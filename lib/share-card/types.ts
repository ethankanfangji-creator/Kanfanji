/** Frozen share-card snapshot — read-only on public share pages. */

export type ShareTextItem = {
  id: string;
  text: string;
  /** Included in shared output when true. */
  selected: boolean;
};

export type SharePhotoItem = {
  id: string;
  /** Display / signed URL when available. */
  url: string;
  /** Storage path for re-signing on share page when needed. */
  remotePath?: string | null;
  tag: string;
  note: string;
  selected: boolean;
};

export type DecisionSummarySnapshot = {
  version: 1;
  address: string;
  viewingAt: string;
  unitLabel: string;
  priceLabel: string;
  layoutLabel: string;
  /** Optional for legacy version-1 snapshots. */
  areaLabel?: string;
  /** Optional for legacy version-1 snapshots. */
  managementFeeLabel?: string;
  listingUrl: string;
  setupNotes: string;
  /** 1–5 overall score; null = not set. */
  overallRating: number | null;
  pros: ShareTextItem[];
  risks: ShareTextItem[];
  facts: ShareTextItem[];
  followUps: ShareTextItem[];
  actionItems: ShareTextItem[];
  photos: SharePhotoItem[];
  disclaimer: string;
  generatedAt: string;
};

export type DecisionSummaryBuildInput = {
  address: string;
  viewingAt?: string;
  unitLabel?: string;
  priceLabel?: string;
  layoutLabel?: string;
  areaLabel?: string;
  managementFeeLabel?: string;
  listingUrl?: string;
  setupNotes?: string;
  overallRating?: number | null;
  pros?: Array<{ id?: string; text: string; selected?: boolean } | string>;
  risks?: Array<{ id?: string; text: string; selected?: boolean } | string>;
  facts?: Array<{ id?: string; text: string; selected?: boolean } | string>;
  followUps?: Array<{ id?: string; text: string; selected?: boolean } | string>;
  actionItems?: Array<{ id?: string; text: string; selected?: boolean } | string>;
  photos?: Array<{
    id: string | number;
    url?: string;
    thumbUrl?: string;
    remotePath?: string | null;
    tag?: string;
    note?: string;
    selected?: boolean;
  }>;
  disclaimer: string;
  generatedAt?: string;
  /** Prefer at most N pros/risks selected by default. */
  defaultSelectedLimit?: number;
};
