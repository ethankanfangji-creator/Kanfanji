/** IndexedDB schema for a single active on-device viewing draft + media blobs. */

export const IDB_NAME = "kanfangji";
export const IDB_VERSION = 1;

/** Soft cap for local media blobs (keep uploaded copies for offline preview). */
export const MEDIA_QUOTA_BYTES = 300 * 1024 * 1024;

export const ACTIVE_DRAFT_ID = "active";

export type DraftSyncStatus =
  | "local"
  | "pending_upload"
  | "synced"
  | "error"
  | "local_only"
  | "pending"
  | "syncing"
  | "failed"
  | "conflict";
export type MediaKind = "photo" | "video" | "audio";
export type MediaUploadStatus = "local" | "uploading" | "uploaded" | "failed";

export type DraftQuestion = {
  id: number;
  text: string;
  checked: boolean;
  answer?: string;
  isFollowUp?: boolean;
  basedOn?: string;
  isDynamic?: boolean;
  source?: string;
};

export type DraftAudioNote = {
  id: number;
  duration: number;
  transcript: string;
  matched: number[];
  /** Links to media store row when raw audio was kept. */
  mediaId?: string;
  /** text = typed field note; transcript = voice pipeline. */
  kind?: "transcript" | "text";
};

export type ViewingDraftRecord = {
  id: string;
  /** Stable DraftDb viewingSessions.id for sync queue continuity. */
  localSessionId: string | null;
  remoteViewingId: string | null;
  shareToken: string | null;
  address: string;
  tags: string[];
  market: "CA" | "TH" | "OTHER";
  identified: boolean;
  questions: DraftQuestion[];
  notes: DraftAudioNote[];
  pros: string[];
  risks: string[];
  propertyDraft: Record<string, unknown>;
  syncStatus: DraftSyncStatus;
  lastError: string | null;
  clientUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
  /** Wizard step 1–3; optional for older drafts. */
  wizardStep?: 1 | 2 | 3;
  /** ISO datetime of the viewing appointment. */
  viewingAt?: string;
  unitLabel?: string;
  priceLabel?: string;
  layoutLabel?: string;
  listingUrl?: string;
  setupNotes?: string;
};

export type MediaRecord = {
  id: string;
  draftId: string;
  kind: MediaKind;
  /** Display tag / clip label */
  label: string;
  mimeType: string;
  size: number;
  createdAt: string;
  blob: Blob;
  remotePath: string | null;
  uploadStatus: MediaUploadStatus;
  /** Client-side numeric id used in UI lists (Date.now based). */
  clientNumericId: number;
};
