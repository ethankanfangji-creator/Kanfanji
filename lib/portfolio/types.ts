/**
 * Built-in suggestion ids (also legacy decision buckets).
 * Freeform user tags are plain strings on the viewing — see viewing-tags.ts.
 */
export const DECISION_STATUSES = ["liked", "shortlist", "passed", "revisit"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export type PortfolioScopeMode = "all" | "time" | "ids" | "status";

export type PortfolioScope = {
  mode: PortfolioScopeMode;
  /** ISO timestamp lower bound when mode is "time". */
  since?: string | null;
  viewingIds?: string[];
  statuses?: DecisionStatus[];
};

/** Share-link visitor feedback attached to a home (not owner notes). */
export type PortfolioShareComment = {
  authorLabel: string;
  body: string;
  createdAt: string;
};

/** Compact per-home card sent to / assembled for the ask API. */
export type PortfolioFactCard = {
  id: string;
  address: string;
  updatedAt: string;
  decisionStatus: DecisionStatus | null;
  /** User conclusions / labels (suggestion ids + freeform). */
  tags: string[];
  price: string | null;
  layout: string | null;
  area: string | null;
  pros: string[];
  risks: string[];
  summary: string | null;
  /** Truncated on-site notes for grounding. */
  notesExcerpt: string;
  fields: Record<string, string>;
  /** Comments from share report links; kept separate from notes. */
  shareComments: PortfolioShareComment[];
};

export type PortfolioCitation = {
  viewingId: string;
  excerpt: string;
};

export type PortfolioAskResult = {
  answer: string;
  matchedIds: string[];
  citations: PortfolioCitation[];
  suggestCompare: boolean;
};

export type PortfolioChatTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  matchedIds?: string[];
  citations?: PortfolioCitation[];
  suggestCompare?: boolean;
  feedback?: "like" | "dislike" | null;
  feedbackReason?: string | null;
};
