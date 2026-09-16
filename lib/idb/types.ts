/** IndexedDB schema for a single active on-device viewing draft + media blobs. */

import type { AudioMarker } from "@/lib/audio-markers";
import type { ViewingAiSummary } from "@/lib/ai-summary";
import type { FieldChecklistItem } from "@/lib/field-capture";

export const IDB_NAME = "kanfangji";
export const IDB_VERSION = 3;

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
  /** Realtime markers captured during recording (seekable in player / AI). */
  markers?: AudioMarker[];
  /** Durable AI job used to make recovered application idempotent. */
  aiJobId?: string;
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
  /** Explicit, versioned AI consent scoped to this local viewing session. */
  aiConsent?: {
    version: string;
    sessionId: string;
    decision: "accepted" | "declined";
    decidedAt: string;
  } | null;
  /**
   * Audio blob saved on stop/interrupt before Whisper finishes.
   * Cleared after successful processRecording (or user discards).
   */
  pendingAudioProcess?: {
    mediaId: string;
    clientNumericId: number;
    durationSec: number;
    createdAt: string;
    markers?: AudioMarker[];
  } | null;
  /**
   * Markers for the in-progress recording (survive interrupt / reload).
   * Cleared after stop+save attaches them to the note/media.
   */
  liveAudioMarkers?: AudioMarker[];
  /** Structured AI summary from process-recording (editable). */
  aiSummary?: ViewingAiSummary | null;
  /**
   * On-site inspection checklist (separate from AI question bank).
   * Optional for older drafts — UI seeds presets when missing/empty.
   */
  fieldChecklist?: FieldChecklistItem[];
};

export type MediaRecord = {
  id: string;
  draftId: string;
  kind: MediaKind;
  /** Display tag / clip label (photo tag label or tag id) */
  label: string;
  /** Stable photo tag id when kind === "photo". */
  tagId?: string;
  /** One-line caption / annotation for the media item. */
  note?: string;
  mimeType: string;
  size: number;
  createdAt: string;
  /** Original bytes — source of truth for upload / Vision. */
  blob: Blob;
  /** True when uploaded bytes were evicted; metadata and remotePath remain usable. */
  bodyEvicted?: boolean;
  /**
   * Optional downscaled JPEG for grid previews only.
   * Prefer this for list UI; keep full `blob` for expand / upload.
   */
  thumbBlob?: Blob | null;
  thumbMimeType?: string | null;
  remotePath: string | null;
  uploadStatus: MediaUploadStatus;
  /** Client-side numeric id used in UI lists (Date.now based). */
  clientNumericId: number;
  /** Audio markers (kind=audio) for player seek + AI context. */
  markers?: AudioMarker[];
};
