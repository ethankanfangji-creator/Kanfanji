export { createSyncEngine, SyncEngine } from "./engine";
export type { SyncEngineOptions } from "./engine";
export { createMockViewingSyncAdapter } from "./mock-adapter";
export type { MockSyncAdapterState } from "./mock-adapter";
export { decideMerge, syncStatusToUi } from "./merge";
export {
  canTransitionSyncStatus,
  getViewingLifecycleState,
  transitionSyncStatus,
} from "./lifecycle";
export type { SyncLifecycleEvent, ViewingLifecycleState } from "./lifecycle";
export { auditViewingSessionBridge } from "./bridge-audit";
export type { ViewingBridgeAudit } from "./bridge-audit";
export { classifySyncError, backoffMs } from "./errors";
export { createSupabaseViewingSyncAdapter } from "./supabase-adapter";
export { claimGuestDrafts, getSyncEngine, resetSyncEngineSingleton } from "./runtime";
export type {
  ActiveDraftBridgeInput,
  ClassifiedSyncError,
  EnqueueSessionOptions,
  MergeDecision,
  ProcessQueueResult,
  RemoteViewingSnapshot,
  SaveRemoteViewingInput,
  SaveRemoteViewingResult,
  SessionUiStatus,
  SyncErrorCode,
  UploadRemoteMediaInput,
  UploadRemoteMediaResult,
  ViewingSyncAdapter,
} from "./types";
