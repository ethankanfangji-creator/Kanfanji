import type { ViewingQuestion } from "@/lib/types";
import type { MediaKind, SyncStatus, ViewingSession } from "@/lib/draft-db";

export type SyncErrorCode =
  | "network"
  | "permission"
  | "file_too_large"
  | "api"
  | "conflict"
  | "offline"
  | "unknown";

export type ClassifiedSyncError = {
  code: SyncErrorCode;
  message: string;
  retryable: boolean;
};

export type RemoteViewingSnapshot = {
  id: string;
  clientUpdatedAt: string | null;
  updatedAt: string | null;
  address: string;
  shareToken: string | null;
};

export type SaveRemoteViewingInput = {
  localSessionId: string;
  remoteViewingId: string | null;
  userId: string;
  address: string;
  tags: string[];
  market: "CA" | "TH" | "OTHER";
  questions: ViewingQuestion[];
  notes: unknown[];
  pros: string[];
  risks: string[];
  property: Record<string, unknown>;
  propertyId: string | null;
  isPro: boolean;
  clientUpdatedAt: string;
  shareToken: string | null;
};

export type SaveRemoteViewingResult = {
  id: string;
  shareToken: string;
  /** Adapter observed a newer remote and refused to overwrite. */
  conflict: boolean;
  skippedAsStale: boolean;
};

export type UploadRemoteMediaInput = {
  remoteViewingId: string;
  mediaId: string;
  kind: MediaKind;
  blob: Blob;
  mimeType: string;
  /** Prefer stable path segment = mediaId for idempotent re-uploads. */
  filename: string;
};

export type UploadRemoteMediaResult = {
  storagePath: string;
  alreadyExisted: boolean;
};

/**
 * Cloud contract used by SyncEngine.
 * Implementations must wrap real Supabase helpers — do not invent REST routes.
 */
export interface ViewingSyncAdapter {
  getCurrentUserId(): Promise<string | null>;
  isOnline(): boolean;
  getRemoteViewing(remoteId: string): Promise<RemoteViewingSnapshot | null>;
  saveRemoteViewing(input: SaveRemoteViewingInput): Promise<SaveRemoteViewingResult>;
  uploadRemoteMedia(input: UploadRemoteMediaInput): Promise<UploadRemoteMediaResult>;
  appendRemoteMediaPath(
    remoteViewingId: string,
    kind: MediaKind,
    storagePath: string,
  ): Promise<void>;
}

export type SessionUiStatus = {
  status: SyncStatus;
  labelKey:
    | "savedLocal"
    | "pending"
    | "syncing"
    | "synced"
    | "failed"
    | "conflict";
  errorMessage: string | null;
  canRetry: boolean;
};

export type EnqueueSessionOptions = {
  userId: string | null;
  /** When true, re-queue failed media even if previously marked uploaded is false. */
  forceMedia?: boolean;
};

export type ProcessQueueResult = {
  processed: number;
  succeeded: number;
  failed: number;
  conflicts: number;
  skippedOffline: boolean;
};

export type MergeDecision = "push" | "skip_remote_newer_clean" | "conflict";

export type ActiveDraftBridgeInput = {
  /** Prefer stable DraftDb session id; falls back to creating one. */
  sessionId?: string;
  userId?: string | null;
  remoteViewingId: string | null;
  shareToken: string | null;
  address: string;
  tags: string[];
  market: "CA" | "TH" | "OTHER" | null;
  identified: boolean;
  questions: ViewingQuestion[];
  notes: Array<{
    id: number;
    duration: number;
    transcript: string;
    matched: number[];
    mediaId?: string;
  }>;
  pros: string[];
  risks: string[];
  propertyDraft: Record<string, unknown>;
  clientUpdatedAt: string;
  media: Array<{
    id: string;
    kind: MediaKind;
    label: string;
    mimeType: string;
    size: number;
    blob: Blob;
    remotePath: string | null;
    uploadStatus: "local" | "uploading" | "uploaded" | "failed";
    durationSec?: number | null;
  }>;
  isPro?: boolean;
};

export type SyncedSessionView = Pick<
  ViewingSession,
  | "id"
  | "remoteViewingId"
  | "syncStatus"
  | "lastSyncError"
  | "updatedAt"
  | "userId"
  | "address"
>;
