import type { ViewingQuestion } from "@/lib/types";

/**
 * Canonical sync lifecycle for sessions / notes / media / queue items.
 * Legacy aliases (`local`, `error`, `pending_upload`) are normalized at read time.
 */
export type SyncStatus =
  | "local_only"
  | "pending"
  | "syncing"
  | "synced"
  | "failed"
  | "conflict";

export const SYNC_STATUSES: readonly SyncStatus[] = [
  "local_only",
  "pending",
  "syncing",
  "synced",
  "failed",
  "conflict",
] as const;

export type MediaKind = "photo" | "video" | "audio";

export type NoteKind = "transcript" | "text";

export type SyncEntityType = "viewingSession" | "note" | "media";

export type SyncOperation = "create" | "update" | "delete" | "upload";

export type UploadStatus = "local" | "uploading" | "uploaded" | "failed";

/** Shared sync / audit fields for future cloud sync. */
export type SyncableFields = {
  userId: string | null;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Monotonic local record revision (optimistic concurrency). */
  version: number;
};

export type ViewingSession = SyncableFields & {
  id: string;
  remoteViewingId: string | null;
  address: string;
  tags: string[];
  market: "CA" | "TH" | "OTHER" | null;
  questions: ViewingQuestion[];
  propertyDraft: Record<string, unknown>;
  identified: boolean;
  pros: string[];
  risks: string[];
  lastSyncError: string | null;
};

export type Note = SyncableFields & {
  id: string;
  sessionId: string;
  kind: NoteKind;
  body: string;
  durationSec: number | null;
  matchedQuestionIds: number[];
  /** Optional link to an audio media row. */
  mediaId: string | null;
};

export type MediaItem = SyncableFields & {
  id: string;
  sessionId: string;
  kind: MediaKind;
  mimeType: string;
  size: number;
  label: string | null;
  tag: string | null;
  durationSec: number | null;
  /** Binary payload — never base64 / localStorage. */
  blob: Blob;
  remoteUrl: string | null;
  storagePath: string | null;
  uploadStatus: UploadStatus;
};

export type SyncQueueItem = SyncableFields & {
  id: string;
  sessionId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown> | null;
  attempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
};

export type CreateViewingSessionInput = {
  id?: string;
  userId?: string | null;
  remoteViewingId?: string | null;
  address?: string;
  tags?: string[];
  market?: ViewingSession["market"];
  questions?: ViewingQuestion[];
  propertyDraft?: Record<string, unknown>;
  identified?: boolean;
  pros?: string[];
  risks?: string[];
  syncStatus?: SyncStatus;
  lastSyncError?: string | null;
};

export type UpdateViewingSessionInput = Partial<
  Omit<ViewingSession, "id" | "createdAt" | "version">
> & { id?: never };

export type CreateNoteInput = {
  id?: string;
  sessionId: string;
  kind?: NoteKind;
  body: string;
  durationSec?: number | null;
  matchedQuestionIds?: number[];
  mediaId?: string | null;
  userId?: string | null;
  syncStatus?: SyncStatus;
};

export type UpdateNoteInput = Partial<Omit<Note, "id" | "createdAt" | "version" | "sessionId">> & {
  id?: never;
  sessionId?: never;
};

export type CreateMediaInput = {
  id?: string;
  sessionId: string;
  kind: MediaKind;
  blob: Blob;
  mimeType?: string;
  label?: string | null;
  tag?: string | null;
  durationSec?: number | null;
  remoteUrl?: string | null;
  storagePath?: string | null;
  uploadStatus?: UploadStatus;
  userId?: string | null;
  syncStatus?: SyncStatus;
};

export type UpdateMediaInput = Partial<
  Omit<MediaItem, "id" | "createdAt" | "version" | "sessionId">
> & { id?: never; sessionId?: never };

export type CreateSyncQueueInput = {
  id?: string;
  sessionId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload?: Record<string, unknown> | null;
  attempts?: number;
  lastError?: string | null;
  nextRetryAt?: string | null;
  userId?: string | null;
  syncStatus?: SyncStatus;
};

export type UpdateSyncQueueInput = Partial<
  Omit<SyncQueueItem, "id" | "createdAt" | "version">
> & { id?: never };

export type ListOptions = {
  includeDeleted?: boolean;
};

export type DraftDbSchemaV1 = {
  viewingSessions: {
    key: string;
    value: ViewingSession;
    indexes: {
      byUpdatedAt: string;
      bySyncStatus: string;
      byUserId: string;
      byDeletedAt: string;
    };
  };
  notes: {
    key: string;
    value: Note;
    indexes: {
      bySessionId: string;
      bySyncStatus: string;
      byUpdatedAt: string;
      byDeletedAt: string;
    };
  };
  media: {
    key: string;
    value: MediaItem;
    indexes: {
      bySessionId: string;
      byKind: string;
      byUploadStatus: string;
      byUpdatedAt: string;
      byDeletedAt: string;
    };
  };
  syncQueue: {
    key: string;
    value: SyncQueueItem;
    indexes: {
      bySessionId: string;
      bySyncStatus: string;
      byNextRetryAt: string;
      byUpdatedAt: string;
      byDeletedAt: string;
    };
  };
};

/** Current schema = v1 stores + v2 additive indexes. */
export type DraftDbSchema = DraftDbSchemaV1 & {
  viewingSessions: {
    key: string;
    value: ViewingSession;
    indexes: DraftDbSchemaV1["viewingSessions"]["indexes"] & {
      byRemoteViewingId: string;
    };
  };
};
