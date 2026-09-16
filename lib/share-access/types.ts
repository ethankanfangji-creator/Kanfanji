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
};

/** Public payload — least privilege for /s/[token]. */
export type PublicSharePayload = {
  version: 1;
  capability: ShareCapability;
  status: "active";
  title: string;
  address: string;
  updatedAt: string | null;
  decisionSummary: import("@/lib/share-card").DecisionSummarySnapshot | null;
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
