/**
 * Full Step-3 viewing report — readable AI-integrated summary that preserves
 * original user records alongside derived tickets / risks / summaries.
 */

export type ViewingReportCategory =
  | "condition"
  | "transit"
  | "amenities"
  | "costs_docs"
  | "onsite_confirm"
  | "other";

export type ViewingReportTicketItem = {
  id: number;
  text: string;
  answer?: string;
  category: ViewingReportCategory;
  priority?: "high" | "medium" | "low";
  /** answered | unanswered | needs_more */
  status: "answered" | "unanswered" | "needs_more";
  /** Present when source is AI discovery. */
  discoveryStatus?: "pending" | "confirmed" | "ignored";
  hint?: string;
};

export type ViewingReportObservation = {
  id: string;
  kind: "text" | "transcript" | "image" | "mixed";
  text?: string;
  transcript?: string;
  createdAt: string;
  boundQuestionId?: number | null;
  /** AI message / patch note — never replaces original text. */
  aiNote?: string | null;
};

export type ViewingReportPhoto = {
  id: string;
  url: string;
  tag: string;
  note: string;
};

export type ViewingReportCategorySummary = {
  category: ViewingReportCategory;
  answeredCount: number;
  openCount: number;
  /** Short excerpts from answered tickets in this category. */
  highlights: string[];
};

export type ViewingReport = {
  version: 1;
  generatedAt: string;
  property: {
    address: string;
    unitLabel: string;
    priceLabel: string;
    layoutLabel: string;
    areaLabel: string;
    managementFeeLabel: string;
    listingUrl: string;
    setupNotes: string;
    propertyType: string | null;
    yearBuilt: string | null;
    basicsSummary: string | null;
    sources: string[];
  };
  viewing: {
    viewingAt: string;
    market: string;
    tags: string[];
    localSessionId: string | null;
  };
  categorySummaries: ViewingReportCategorySummary[];
  observations: ViewingReportObservation[];
  /** Legacy typed / voice notes kept as original user records. */
  originalNotes: Array<{
    id: number;
    kind: "text" | "transcript";
    text: string;
  }>;
  photos: ViewingReportPhoto[];
  tickets: {
    answered: ViewingReportTicketItem[];
    unanswered: ViewingReportTicketItem[];
    discoveries: ViewingReportTicketItem[];
  };
  risks: string[];
  toConfirm: string[];
  aiIntegration: {
    facts: string[];
    pros: string[];
    risks: string[];
    followUps: string[];
    actionItems: string[];
    /** Explicit notice: AI summary complements, does not replace, originals. */
    preserveOriginalsNote: string;
  };
};
