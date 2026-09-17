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
export type AiJobKind = "audio" | "photo";

export type UploadStatus = "local" | "uploading" | "uploaded" | "failed";

/** Shared sync / audit fields for future cloud sync. */
export type SyncableFields = {
  /** Local authorization boundary. Guest and user rows never share a scope. */
  accountScope: string;
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
  remoteRevision: number | null;
  address: string;
  tags: string[];
  market: "CA" | "TH" | "OTHER" | null;
  questions: ViewingQuestion[];
  propertyDraft: Record<string, unknown>;
  identified: boolean;
  pros: string[];
  risks: string[];
  lastSyncError: string | null;
  /**
   * Product lifecycle (orthogonal to syncStatus).
   * Older rows without this field are treated as "draft" at read time.
   */
  workflowStatus?:
    | "draft"
    | "collecting"
    | "ready_to_generate"
    | "generating"
    | "generated"
    | "abandoned";
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
  /** Legacy DraftDb blobs remain readable; new bridge rows reference canonical kanfangji media. */
  blob: Blob | null;
  mediaRefId: string | null;
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
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
};

export type AiJob = SyncableFields & {
  id: string;
  sessionId: string;
  mediaId: string;
  kind: AiJobKind;
  consentVersion: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  appliedAt: string | null;
  attempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
};

export type CreateAiJobInput = {
  sessionId: string;
  mediaId: string;
  kind: AiJobKind;
  consentVersion: string;
  payload?: Record<string, unknown>;
  accountScope?: string;
  userId?: string | null;
};

export type CreateViewingSessionInput = {
  id?: string;
  accountScope?: string;
  userId?: string | null;
  remoteViewingId?: string | null;
  remoteRevision?: number | null;
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
  workflowStatus?: ViewingSession["workflowStatus"];
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
  accountScope?: string;
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
  blob?: Blob | null;
  mediaRefId?: string | null;
  size?: number;
  mimeType?: string;
  label?: string | null;
  tag?: string | null;
  durationSec?: number | null;
  accountScope?: string;
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
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  accountScope?: string;
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
      byAccountScope: string;
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
      byAccountScope: string;
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
      byAccountScope: string;
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
      byAccountScope: string;
    };
  };
};

/** Current schema = v1 stores + additive indexes/stores. */
export type DraftDbSchema = DraftDbSchemaV1 & {
  viewingSessions: {
    key: string;
    value: ViewingSession;
    indexes: DraftDbSchemaV1["viewingSessions"]["indexes"] & {
      byRemoteViewingId: string;
    };
  };
  aiJobs: {
    key: string;
    value: AiJob;
    indexes: {
      bySessionId: string;
      byMediaId: string;
      bySyncStatus: string;
      byNextRetryAt: string;
      byAccountScope: string;
    };
  };
};
