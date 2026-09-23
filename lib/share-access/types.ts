/**
 * Share-link access control model.
 * Backend enforcement requires `supabase/migrate-share-links.sql` + non-501 APIs.
 */

export type ShareCapability = "read";

export type ShareLinkStatus =
  | "active"
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
  status: Extract<ShareLinkStatus, "active" | "revoked" | "expired">;
  expiresAt: string | null;
  passwordEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  lastResolvedAt: string | null;
  /** Increments whenever existing unlock cookies must stop working. */
  accessVersion: number;
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
  /** Plaintext only in request body over TLS — never logged or stored. */
  password?: string | null;
  capability?: ShareCapability;
};

export type CreateShareLinkResponse = {
  link: ShareLinkRecord;
  /** Absolute or path URL for owner copy — token only, no password. */
  urlPath: string;
};

export type UpdateShareLinkRequest = {
  expiresAt?: string | null;
  /** Set new password; null clears password. Omitted = unchanged. */
  password?: string | null;
};

export type RotateShareLinkResponse = {
  link: ShareLinkRecord;
  urlPath: string;
  /** Previous token is immediately invalid. */
  previousTokenInvalidated: true;
};

export type UnlockShareRequest = {
  password: string;
};

export type UnlockShareResponse = {
  ok: true;
  /** Cookie is set by Set-Cookie; body must not echo password. */
  expiresAt: string;
};
