/**
 * Share-link access control model.
 * Backend enforcement requires `supabase/migrate-share-links.sql` + non-501 APIs.
 */

export type ShareCapability = "read";

export type ShareLinkStatus =
  | "active"
  | "closed"
  | "revoked"
  | "expired"
  | "missing"
  | "password_required"
  | "forbidden"
  | "error";

/** Owner-facing link metadata (never send password hash to clients). */
export type ShareLinkRecord = {
  id: string;
  viewingId: string;
  /** Opaque URL token — unguessable, not sequential viewing id. */
  token: string;
  capability: ShareCapability;
  status: Extract<ShareLinkStatus, "active" | "closed" | "revoked" | "expired">;
  expiresAt: string | null;
  passwordEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  closedAt: string | null;
  lastResolvedAt: string | null;
  /** Increments whenever existing unlock cookies must stop working. */
  accessVersion: number;
};

/** Cross-viewing row for the owner shares hub (never includes raw token). */
export type OwnerShareLinkListItem = Omit<ShareLinkRecord, "token"> & {
  address: string;
  urlPath: string;
  needsRegenerate: boolean;
  /** From published snapshot when available — list card map cover. */
  lat: number | null;
  lng: number | null;
};

export type OwnerShareCommentListItem = {
  id: string;
  viewingId: string;
  address: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  shareLinkId: string;
};

export type PublicShareTextItem = {
  id: string;
  text: string;
  selected: true;
};

export type PublicSharePhotoItem = {
  id: string;
  url: string;
  tag: string;
  note: string;
  selected: true;
};

/** Explicit public allowlist; intentionally has no remotePath or internal fields. */
export type PublicDecisionSummary = {
  version: 1;
  address: string;
  viewingAt: string;
  unitLabel: string;
  priceLabel: string;
  layoutLabel: string;
  areaLabel?: string;
  managementFeeLabel?: string;
  listingUrl: string;
  setupNotes: string;
  overallRating: number | null;
  pros: PublicShareTextItem[];
  risks: PublicShareTextItem[];
  facts: PublicShareTextItem[];
  followUps: PublicShareTextItem[];
  actionItems: PublicShareTextItem[];
  photos: PublicSharePhotoItem[];
  disclaimer: string;
  generatedAt: string;
  /** Confirmed pin for map cover + open-in-maps (optional). */
  lat?: number;
  lng?: number;
};

/** Public payload — least privilege for /s/[token]. */
export type PublicSharePayload = {
  version: 1;
  capability: ShareCapability;
  status: "active";
  title: string;
  address: string;
  updatedAt: string | null;
  decisionSummary: PublicDecisionSummary | null;
  /** Selected photo object paths already signed for display. */
  photoUrls: string[];
  /** Legacy cards without decisionSummary — capped lists only. */
  legacyHighlights?: {
    pros: string[];
    risks: string[];
  };
  chatReport?:
    | {
        version: 3;
        kind: "chat_report";
        title: string;
        address: string;
        summary: string | null;
        reportGeneratedAt: string;
        publishedAt: string;
        meta?: {
          viewingDate?: string | null;
          propertyType?: string | null;
          yearBuilt?: string | null;
          askingPrice?: string | null;
          lotSize?: string | null;
          interiorSize?: string | null;
          layout?: string | null;
          neighborhood?: string | null;
        };
        overview?: string;
        interior?: string;
        outdoorLand?: string;
        transitLifestyle?: string;
        pricing?: string;
        pros: string[];
        risks: string[];
        scores?: {
          items: Array<{ label: string; score: number }>;
          overall?: string;
          highlight?: string;
          biggestQuestion?: string;
        };
        verdict?: string;
        nextSteps?: string[];
        lat?: number;
        lng?: number;
      }
    | {
        version: 2;
        kind: "chat_report";
        title: string;
        address: string;
        summary: string | null;
        pros: string[];
        risks: string[];
        followUps: string[];
        reportGeneratedAt: string;
        publishedAt: string;
        checklist: Array<{ question: string; answer: string; status: "ok" | "risk" | "unknown" }>;
        fields: Array<{ fieldId: string; value: string; status: string }>;
      };
  /** Honest flags for the viewer. */
  meta: {
    passwordProtected: boolean;
    expiresAt: string | null;
    /** ISO time when the shared snapshot was last published. */
    snapshotUpdatedAt: string | null;
  };
};

/** Frozen, explicit allowlist persisted on share_links at publish time. */
export type PublishedShareSnapshot = {
  version: 1;
  title: string;
  address: string;
  updatedAt: string | null;
  decisionSummary: PublicDecisionSummary | null;
  legacyHighlights?: {
    pros: string[];
    risks: string[];
  };
  publishedAt: string;
  lat?: number;
  lng?: number;
};

/** Server-only manifest. Paths are storage object keys, never signed URLs. */
export type PublishedShareMediaItem = {
  id: string;
  path: string;
};

export type PublicShareFailure = {
  version: 1;
  status: Exclude<ShareLinkStatus, "active" | "password_required">;
  message: string;
};

export type PublicSharePasswordGate = {
  version: 1;
  status: "password_required";
  /** Non-sensitive challenge id for unlock POST (not the viewing id). */
  challengeId: string;
  message: string;
};

export type PublicShareResult =
  | PublicSharePayload
  | PublicShareFailure
  | PublicSharePasswordGate;

/** Fields that must never appear on a public share response. */
export const PUBLIC_SHARE_FORBIDDEN_KEYS = [
  "user_id",
  "userId",
  "email",
  "audio_urls",
  "audioUrls",
  "notes",
  "transcript",
  "questions",
  "is_pro",
  "isPro",
  "client_updated_at",
  "propertyDraft",
  "decisionSummaryDraft",
  "liveAudioMarkers",
  "fieldChecklist",
  "shareToken",
  "share_token",
  "shareAccess",
  "passwordHash",
  "password_hash",
  "remotePath",
  "property",
] as const;

export type CreateShareLinkRequest = {
  viewingId: string;
  expiresAt?: string | null;
  capability?: ShareCapability;
};

export type CreateShareLinkResponse = {
  link: ShareLinkRecord;
  /** Absolute or path URL for owner copy — token only. */
  urlPath: string;
};

export type UpdateShareLinkRequest = {
  expiresAt?: string | null;
  /** @deprecated Password sharing is retired; API returns 400 if present. */
  password?: string | null;
};

export type RotateShareLinkResponse = {
  link: ShareLinkRecord;
  urlPath: string;
  /** Previous token is immediately invalid. */
  previousTokenInvalidated: true;
};
