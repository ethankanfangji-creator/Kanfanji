import type {
  RemoteViewingSnapshot,
  SaveRemoteViewingInput,
  SaveRemoteViewingResult,
  UploadRemoteMediaInput,
  UploadRemoteMediaResult,
  ViewingSyncAdapter,
} from "./types";

export type MockSyncAdapterState = {
  online: boolean;
  userId: string | null;
  remotes: Map<string, RemoteViewingSnapshot & { notes?: unknown[] }>;
  uploads: Map<string, string>;
  saveCalls: SaveRemoteViewingInput[];
  uploadCalls: UploadRemoteMediaInput[];
  failNextSave?: Error | null;
  failNextUpload?: Error | null;
  failUploadForMediaIds?: Set<string>;
};

export function createMockViewingSyncAdapter(
  initial?: Partial<MockSyncAdapterState>,
): ViewingSyncAdapter & { state: MockSyncAdapterState } {
  const state: MockSyncAdapterState = {
    online: initial?.online ?? true,
    userId: initial?.userId ?? "user-1",
    remotes: initial?.remotes ?? new Map(),
    uploads: initial?.uploads ?? new Map(),
    saveCalls: [],
    uploadCalls: [],
    failNextSave: initial?.failNextSave ?? null,
    failNextUpload: initial?.failNextUpload ?? null,
    failUploadForMediaIds: initial?.failUploadForMediaIds ?? new Set(),
  };

  const adapter: ViewingSyncAdapter & { state: MockSyncAdapterState } = {
    state,
    isOnline: () => state.online,
    getCurrentUserId: async () => state.userId,
    getRemoteViewing: async (remoteId) => state.remotes.get(remoteId) ?? null,
    saveRemoteViewing: async (input) => {
      state.saveCalls.push(input);
      if (state.failNextSave) {
        const err = state.failNextSave;
        state.failNextSave = null;
        throw err;
      }

      if (input.remoteViewingId) {
        const remote = state.remotes.get(input.remoteViewingId);
        if (
          input.expectedRevision != null &&
          remote?.revision != null &&
          input.expectedRevision !== remote.revision
        ) {
          return {
            id: input.remoteViewingId,
            conflict: true,
            skippedAsStale: false,
            revision: remote.revision,
          };
        }
        if (remote?.clientUpdatedAt) {
          const remoteTs = Date.parse(remote.clientUpdatedAt) || 0;
          const localTs = Date.parse(input.clientUpdatedAt) || 0;
          if (remoteTs > localTs) {
            return {
              id: input.remoteViewingId,
              conflict: true,
              skippedAsStale: true,
              revision: remote.revision ?? 1,
            };
          }
        }
      }

      const id = input.remoteViewingId || `remote-${state.saveCalls.length}`;
      const revision = (state.remotes.get(id)?.revision ?? 0) + 1;
      state.remotes.set(id, {
        id,
        address: input.address,
        clientUpdatedAt: input.clientUpdatedAt,
        updatedAt: input.clientUpdatedAt,
        shareToken: null,
        revision,
      });
      return { id, conflict: false, skippedAsStale: false, revision };
    },
    uploadRemoteMedia: async (input) => {
      state.uploadCalls.push(input);
      if (state.failNextUpload) {
        const err = state.failNextUpload;
        state.failNextUpload = null;
        throw err;
      }
      if (state.failUploadForMediaIds?.has(input.mediaId)) {
        throw new Error("Payload too large");
      }
      const existing = state.uploads.get(input.mediaId);
      if (existing) {
        return { storagePath: existing, alreadyExisted: true };
      }
      const path = `${state.userId}/${input.remoteViewingId}/${input.kind}s/${input.filename}`;
      state.uploads.set(input.mediaId, path);
      return { storagePath: path, alreadyExisted: false };
    },
    appendRemoteMediaPath: async () => {
      // no-op for mock; paths tracked via uploads map
    },
  };

  return adapter;
}

export type { SaveRemoteViewingResult, UploadRemoteMediaResult };
