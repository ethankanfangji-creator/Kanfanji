/**
 * Media upload / signed URL storage.
 * TODO: Wrap lib/media.ts behind MediaStorageService; keep secrets server-side.
 */

export type MediaStorageStatus = "ready" | "unconfigured" | "error";

export type MediaStorageService = {
  status(): MediaStorageStatus;
  upload(input: {
    viewingId: string;
    blob: Blob;
    path: string;
    signal?: AbortSignal;
  }): Promise<{ ok: true; remotePath: string } | { ok: false; code: string; retryable: boolean }>;
};

export function createMockMediaStorageService(
  status: MediaStorageStatus = "unconfigured",
): MediaStorageService {
  return {
    status: () => status,
    async upload() {
      if (status !== "ready") {
        return { ok: false, code: "storage_unconfigured", retryable: false };
      }
      return { ok: true, remotePath: "mock/path.jpg" };
    },
  };
}
