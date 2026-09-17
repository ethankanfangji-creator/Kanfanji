import {
  DraftDb,
  type MediaItem,
  type SyncQueueItem,
  type ViewingSession,
} from "@/lib/draft-db";
import { extensionFor } from "@/lib/media-paths";
import { getMedia as getCanonicalMedia } from "@/lib/idb/draft-store";
import { backoffMs, classifySyncError } from "./errors";
import { transitionSyncStatus } from "./lifecycle";
import { decideMerge, syncStatusToUi } from "./merge";
import type {
  ActiveDraftBridgeInput,
  EnqueueSessionOptions,
  ProcessQueueResult,
  SessionUiStatus,
  ViewingSyncAdapter,
} from "./types";

const MAX_ATTEMPTS = 8;

export type SyncEngineOptions = {
  db: DraftDb;
  adapter: ViewingSyncAdapter;
  isPro?: boolean;
};

export class SyncEngine {
  private readonly db: DraftDb;
  private readonly adapter: ViewingSyncAdapter;
  private running = false;
  private readonly workerId = `sync-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  private isPro: boolean;

  constructor(options: SyncEngineOptions) {
    this.db = options.db;
    this.adapter = options.adapter;
    this.isPro = options.isPro ?? false;
  }

  setIsPro(isPro: boolean) {
    this.isPro = isPro;
  }

  /**
   * Upsert DraftDb session + media from the live UI / lib/idb active draft,
   * then return the stable session id.
   */
  async importActiveDraft(input: ActiveDraftBridgeInput): Promise<string> {
    const existing =
      (input.sessionId ? await this.db.viewingSessions.get(input.sessionId) : null) ??
      (input.remoteViewingId
        ? (await this.db.viewingSessions.list({ includeDeleted: true })).find(
            (row) => row.remoteViewingId === input.remoteViewingId,
          )
        : null);

    let session: ViewingSession;
    if (existing) {
      session = await this.db.viewingSessions.update(existing.id, {
        userId: input.userId ?? existing.userId,
        remoteViewingId: input.remoteViewingId,
        address: input.address,
        tags: input.tags,
        market: input.market,
        identified: input.identified,
        questions: input.questions,
        propertyDraft: {
          ...input.propertyDraft,
          shareToken: input.shareToken,
          notes: input.notes,
          pros: input.pros,
          risks: input.risks,
          clientUpdatedAt: input.clientUpdatedAt,
          isPro: input.isPro ?? this.isPro,
        },
        pros: input.pros,
        risks: input.risks,
        workflowStatus: input.workflowStatus ?? existing.workflowStatus ?? "draft",
        syncStatus:
          existing.syncStatus === "synced" || existing.syncStatus === "conflict"
            ? "pending"
            : existing.syncStatus === "local_only"
              ? "pending"
              : existing.syncStatus,
        lastSyncError: null,
      });
    } else {
      session = await this.db.viewingSessions.create({
        id: input.sessionId,
        userId: input.userId ?? null,
        remoteViewingId: input.remoteViewingId,
        address: input.address,
        tags: input.tags,
        market: input.market,
        identified: input.identified,
        questions: input.questions,
        propertyDraft: {
          ...input.propertyDraft,
          shareToken: input.shareToken,
          notes: input.notes,
          pros: input.pros,
          risks: input.risks,
          clientUpdatedAt: input.clientUpdatedAt,
          isPro: input.isPro ?? this.isPro,
        },
        pros: input.pros,
        risks: input.risks,
        workflowStatus: input.workflowStatus ?? "draft",
        syncStatus: "pending",
      });
    }

    // Mirror notes as Note rows (text/transcript) for future fine-grained sync.
    const existingNotes = await this.db.notes.listBySession(session.id, { includeDeleted: true });
    for (const note of input.notes) {
      const noteId = note.mediaId ? `note:${note.mediaId}` : `note:client:${note.id}`;
      const found = existingNotes.find((row) => row.id === noteId);
      if (found) {
        await this.db.notes.update(noteId, {
          body: note.transcript,
          durationSec: note.duration,
          matchedQuestionIds: note.matched,
          mediaId: note.mediaId ?? null,
          syncStatus: "pending",
          userId: input.userId ?? null,
        });
      } else {
        await this.db.notes.create({
          id: noteId,
          sessionId: session.id,
          kind: "transcript",
          body: note.transcript,
          durationSec: note.duration,
          matchedQuestionIds: note.matched,
          mediaId: note.mediaId ?? null,
          userId: input.userId ?? null,
          syncStatus: "pending",
        });
      }
    }

    for (const item of input.media) {
      const existingMedia = await this.db.media.get(item.id);
      if (existingMedia) {
        await this.db.media.update(item.id, {
          blob: null,
          mediaRefId: item.id,
          size: item.size,
          mimeType: item.mimeType,
          label: item.label,
          tag: item.label,
          storagePath: item.remotePath,
          uploadStatus: item.uploadStatus,
          syncStatus: item.uploadStatus === "uploaded" ? "synced" : "pending",
          userId: input.userId ?? null,
          durationSec: item.durationSec ?? null,
        });
      } else {
        await this.db.media.create({
          id: item.id,
          sessionId: session.id,
          kind: item.kind,
          blob: null,
          mediaRefId: item.id,
          size: item.size,
          mimeType: item.mimeType,
          label: item.label,
          tag: item.label,
          storagePath: item.remotePath,
          uploadStatus: item.uploadStatus,
          syncStatus: item.uploadStatus === "uploaded" ? "synced" : "pending",
          userId: input.userId ?? null,
          durationSec: item.durationSec ?? null,
        });
      }
    }

    return session.id;
  }

  /** After login: mark session pending and enqueue session + unuploaded media. */
  async enqueueSession(
    sessionId: string,
    options: EnqueueSessionOptions,
  ): Promise<{ sessionId: string; queueIds: string[] }> {
    const session = await this.db.viewingSessions.require(sessionId);
    await this.db.viewingSessions.update(sessionId, {
      userId: options.userId,
      syncStatus: transitionSyncStatus(session.syncStatus, "enqueue"),
      lastSyncError: session.syncStatus === "conflict" ? session.lastSyncError : null,
    });

    const queueIds: string[] = [];
    const sessionJob = await this.db.syncQueue.enqueueIdempotent({
      sessionId,
      entityType: "viewingSession",
      entityId: sessionId,
      operation: session.remoteViewingId ? "update" : "create",
      userId: options.userId,
      syncStatus: "pending",
      payload: null,
    });
    queueIds.push(sessionJob.id);

    const mediaRows = await this.db.media.listBySession(sessionId);
    for (const media of mediaRows) {
      const needsUpload =
        options.forceMedia ||
        media.uploadStatus !== "uploaded" ||
        !media.storagePath;
      if (!needsUpload) continue;
      await this.db.media.update(media.id, {
        syncStatus: "pending",
        uploadStatus: media.uploadStatus === "uploaded" ? "uploaded" : "local",
        userId: options.userId,
      });
      const job = await this.db.syncQueue.enqueueIdempotent({
        sessionId,
        entityType: "media",
        entityId: media.id,
        operation: "upload",
        userId: options.userId,
        syncStatus: "pending",
        payload: { mediaId: media.id },
        force: Boolean(options.forceMedia),
      });
      queueIds.push(job.id);
    }

    return { sessionId, queueIds };
  }

  async getSession(sessionId: string): Promise<ViewingSession | null> {
    return this.db.viewingSessions.get(sessionId);
  }

  async setWorkflowStatus(
    sessionId: string,
    workflowStatus: NonNullable<ViewingSession["workflowStatus"]>,
  ): Promise<ViewingSession | null> {
    const existing = await this.db.viewingSessions.get(sessionId);
    if (!existing) return null;
    return this.db.viewingSessions.update(sessionId, { workflowStatus });
  }

  async listSessionMedia(sessionId: string) {
    return this.db.media.listBySession(sessionId, { includeDeleted: true });
  }

  async getSessionUiStatus(sessionId: string): Promise<SessionUiStatus | null> {
    const session = await this.db.viewingSessions.get(sessionId);
    if (!session) return null;
    return syncStatusToUi(session.syncStatus, session.lastSyncError);
  }

  async retryFailed(sessionId?: string): Promise<ProcessQueueResult> {
    const rows = sessionId
      ? await this.db.syncQueue.listBySession(sessionId)
      : await this.db.syncQueue.list();
    for (const row of rows) {
      if (row.syncStatus === "failed" || row.syncStatus === "conflict") {
        await this.db.syncQueue.markStatus(row.id, "pending", {
          attempts: 0,
          lastError: null,
          nextRetryAt: null,
        });
        await this.db.syncQueue.update(row.id, {
          leaseOwner: null,
          leaseExpiresAt: null,
        });
      }
    }
    if (sessionId) {
      const session = await this.db.viewingSessions.get(sessionId);
      if (session && (session.syncStatus === "failed" || session.syncStatus === "conflict")) {
        // Explicit user retry on conflict = push local (bump client clock). Never silent.
        const bumpedAt = new Date().toISOString();
        await this.db.viewingSessions.update(sessionId, {
          syncStatus: transitionSyncStatus(session.syncStatus, "explicit_retry"),
          lastSyncError: null,
          propertyDraft: {
            ...session.propertyDraft,
            clientUpdatedAt: bumpedAt,
          },
        });
      }
    }
    return this.processQueue();
  }

  async processQueue(): Promise<ProcessQueueResult> {
    const result: ProcessQueueResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      conflicts: 0,
      skippedOffline: false,
    };

    if (!this.adapter.isOnline()) {
      result.skippedOffline = true;
      return result;
    }

    if (this.running) return result;
    this.running = true;

    try {
      for (;;) {
        const job = await this.db.syncQueue.claimNextRunnable(this.workerId);
        if (!job) break;
        result.processed += 1;
        const outcome = await this.processJob(job);
        if (outcome === "ok") result.succeeded += 1;
        else if (outcome === "conflict") result.conflicts += 1;
        else if (outcome === "failed") result.failed += 1;
        else if (outcome === "offline") {
          result.skippedOffline = true;
          break;
        }
      }
    } finally {
      this.running = false;
    }

    return result;
  }

  private async processJob(
    job: SyncQueueItem,
  ): Promise<"ok" | "failed" | "conflict" | "offline" | "skipped"> {
    if (!this.adapter.isOnline()) {
      await this.db.syncQueue.transitionClaimed(job, {
        syncStatus: "pending",
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      return "offline";
    }

    await this.db.viewingSessions.update(job.sessionId, {
      syncStatus: "syncing",
      lastSyncError: null,
    }).catch(() => undefined);

    try {
      if (job.entityType === "viewingSession") {
        return await this.processSessionJob(job);
      }
      if (job.entityType === "media" && job.operation === "upload") {
        return await this.processMediaUploadJob(job);
      }
      await this.db.syncQueue.transitionClaimed(job, {
        syncStatus: "synced",
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      return "ok";
    } catch (error) {
      const classified = classifySyncError(error, this.adapter.isOnline());
      if (classified.code === "offline" || classified.code === "network") {
        const attempts = job.attempts + 1;
        const giveUp = attempts >= MAX_ATTEMPTS;
        await this.db.syncQueue.transitionClaimed(job, {
          syncStatus: giveUp ? "failed" : "pending",
          attempts,
          lastError: classified.message,
          nextRetryAt: giveUp ? null : new Date(Date.now() + backoffMs(attempts)).toISOString(),
          leaseOwner: null,
          leaseExpiresAt: null,
        });
        await this.db.viewingSessions.update(job.sessionId, {
          syncStatus: transitionSyncStatus(
            "syncing",
            giveUp ? "terminal_failure" : "retryable_failure",
          ),
          lastSyncError: classified.message,
        });
        return classified.code === "offline" ? "offline" : "failed";
      }

      const attempts = job.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS || !classified.retryable;
      await this.db.syncQueue.transitionClaimed(job, {
        syncStatus: giveUp ? "failed" : "pending",
        attempts,
        lastError: classified.message,
        nextRetryAt: giveUp
          ? null
          : new Date(Date.now() + backoffMs(attempts)).toISOString(),
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      await this.db.viewingSessions.update(job.sessionId, {
        syncStatus: transitionSyncStatus(
          "syncing",
          giveUp ? "terminal_failure" : "retryable_failure",
        ),
        lastSyncError: classified.message,
      });
      if (job.entityType === "media") {
        await this.db.media.update(job.entityId, {
          uploadStatus: "failed",
          syncStatus: "failed",
        }).catch(() => undefined);
      }
      return "failed";
    }
  }

  private async processSessionJob(job: SyncQueueItem): Promise<"ok" | "conflict" | "failed"> {
    const session = await this.db.viewingSessions.require(job.sessionId);
    const userId =
      job.userId ||
      session.userId ||
      (await this.adapter.getCurrentUserId());
    if (!userId) {
      throw new Error("請先登入後再上傳");
    }

    const mediaRows = await this.db.media.listBySession(session.id);
    const hasUnsyncedMedia = mediaRows.some(
      (row) => row.uploadStatus !== "uploaded" || !row.storagePath,
    );

    const remote = session.remoteViewingId
      ? await this.adapter.getRemoteViewing(session.remoteViewingId)
      : null;

    const clientUpdatedAt =
      typeof session.propertyDraft.clientUpdatedAt === "string"
        ? session.propertyDraft.clientUpdatedAt
        : session.updatedAt;

    const decision = decideMerge({
      localClientUpdatedAt: clientUpdatedAt,
      localSyncStatus: session.syncStatus === "syncing" ? "pending" : session.syncStatus,
      hasUnsyncedMedia,
      remote,
    });

    if (decision === "conflict") {
      const message = "本機與雲端資料衝突，未覆寫任一方。點擊重試前請先確認要以哪一邊為準";
      await this.db.syncQueue.transitionClaimed(job, {
        syncStatus: "conflict",
        lastError: message,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      await this.db.viewingSessions.update(session.id, {
        syncStatus: "conflict",
        lastSyncError: message,
      });
      return "conflict";
    }

    if (decision === "skip_remote_newer_clean") {
      await this.db.syncQueue.transitionClaimed(job, {
        syncStatus: "synced",
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      await this.db.viewingSessions.update(session.id, {
        syncStatus: "synced",
        lastSyncError: null,
        remoteViewingId: remote?.id ?? session.remoteViewingId,
        remoteRevision: remote?.revision ?? session.remoteRevision,
      });
      return "ok";
    }

    const notes =
      (session.propertyDraft.notes as unknown[]) ||
      (await this.db.notes.listBySession(session.id)).map((n) => ({
        id: n.id,
        transcript: n.body,
        duration: n.durationSec ?? 0,
        matched: n.matchedQuestionIds,
      }));
    const pros =
      session.pros.length > 0
        ? session.pros
        : Array.isArray(session.propertyDraft.pros)
          ? (session.propertyDraft.pros as string[])
          : [];
    const risks =
      session.risks.length > 0
        ? session.risks
        : Array.isArray(session.propertyDraft.risks)
          ? (session.propertyDraft.risks as string[])
          : [];

    const result = await this.adapter.saveRemoteViewing({
      localSessionId: session.id,
      remoteViewingId: session.remoteViewingId,
      userId,
      address: session.address,
      tags: session.tags,
      market: session.market === "TH" ? "TH" : session.market === "OTHER" ? "OTHER" : "CA",
      questions: session.questions,
      notes,
      pros,
      risks,
      property: session.propertyDraft,
      propertyId:
        typeof session.propertyDraft.propertyId === "string"
          ? session.propertyDraft.propertyId
          : null,
      isPro: Boolean(session.propertyDraft.isPro ?? this.isPro),
      clientUpdatedAt,
      idempotencyKey: session.id,
      expectedRevision: session.remoteRevision ?? remote?.revision ?? null,
    });

    if (result.conflict) {
      const message = "雲端有較新版本，未覆寫。點擊重試可在確認後再處理";
      await this.db.syncQueue.transitionClaimed(job, {
        syncStatus: "conflict",
        lastError: message,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      await this.db.viewingSessions.update(session.id, {
        syncStatus: "conflict",
        lastSyncError: message,
        remoteViewingId: result.id,
        remoteRevision: result.revision,
      });
      return "conflict";
    }

    await this.db.viewingSessions.update(session.id, {
      remoteViewingId: result.id,
      remoteRevision: result.revision,
      userId,
      syncStatus: hasUnsyncedMedia ? "pending" : "synced",
      lastSyncError: null,
    });
    await this.db.syncQueue.transitionClaimed(job, {
      syncStatus: "synced",
      lastError: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    return "ok";
  }

  private async processMediaUploadJob(job: SyncQueueItem): Promise<"ok" | "failed" | "skipped"> {
    const session = await this.db.viewingSessions.require(job.sessionId);
    if (!session.remoteViewingId) {
      // Session not on cloud yet — requeue after session job.
      await this.db.syncQueue.transitionClaimed(job, {
        syncStatus: "pending",
        lastError: "等待案件先同步到雲端",
        nextRetryAt: new Date(Date.now() + 500).toISOString(),
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      return "skipped";
    }

    const media = await this.db.media.require(job.entityId);

    // Idempotency: already uploaded with storage path → skip binary upload.
    if (media.uploadStatus === "uploaded" && media.storagePath) {
      await this.adapter.appendRemoteMediaPath(
        session.remoteViewingId,
        media.kind,
        media.storagePath,
      );
      await this.db.media.update(media.id, { syncStatus: "synced" });
      await this.db.syncQueue.transitionClaimed(job, {
        syncStatus: "synced",
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      await this.refreshSessionStatus(session.id);
      return "ok";
    }

    await this.db.media.update(media.id, { uploadStatus: "uploading", syncStatus: "syncing" });

    const canonical = media.mediaRefId ? await getCanonicalMedia(media.mediaRefId) : null;
    const blob = media.blob ?? canonical?.blob ?? null;
    if (!blob) throw new Error("找不到本機媒體原始檔，請重新選取後手動重試");
    const filename = `${media.id}.${extensionFor(blob, fallbackExt(media.kind))}`;
    const uploaded = await this.adapter.uploadRemoteMedia({
      remoteViewingId: session.remoteViewingId,
      mediaId: media.id,
      kind: media.kind,
      blob,
      mimeType: media.mimeType,
      filename,
    });

    await this.adapter.appendRemoteMediaPath(
      session.remoteViewingId,
      media.kind,
      uploaded.storagePath,
    );

    await this.db.media.update(media.id, {
      storagePath: uploaded.storagePath,
      uploadStatus: "uploaded",
      syncStatus: "synced",
    });
    await this.db.syncQueue.transitionClaimed(job, {
      syncStatus: "synced",
      lastError: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    await this.refreshSessionStatus(session.id);
    return "ok";
  }

  private async refreshSessionStatus(sessionId: string): Promise<void> {
    const mediaRows = await this.db.media.listBySession(sessionId);
    const queue = await this.db.syncQueue.listBySession(sessionId);
    const pendingMedia = mediaRows.some((row) => row.uploadStatus !== "uploaded");
    const pendingJobs = queue.some(
      (row) =>
        !row.deletedAt &&
        (row.syncStatus === "pending" ||
          row.syncStatus === "failed" ||
          row.syncStatus === "syncing"),
    );
    const conflict = queue.some((row) => row.syncStatus === "conflict");
    if (conflict) {
      await this.db.viewingSessions.update(sessionId, { syncStatus: "conflict" });
      return;
    }
    if (pendingMedia || pendingJobs) {
      await this.db.viewingSessions.update(sessionId, { syncStatus: "pending" });
      return;
    }
    await this.db.viewingSessions.update(sessionId, {
      syncStatus: "synced",
      lastSyncError: null,
    });
  }
}

function fallbackExt(kind: MediaItem["kind"]): string {
  if (kind === "photo") return "jpg";
  if (kind === "video") return "webm";
  return "webm";
}

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  return new SyncEngine(options);
}
