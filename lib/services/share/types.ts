/**
 * Share-link lifecycle. Real implementation lives in lib/share-access (CSPRNG token + ACL).
 * TODO: Have /api/share/* call ShareService; keep public resolve least-privilege.
 */

import type { ShareLink } from "@/lib/domain";

export type ShareServiceStatus = "ready" | "unconfigured" | "error";

export type ShareService = {
  status(): ShareServiceStatus;
  /** Owner-only: create published link for a viewing. */
  createLink(input: {
    viewingId: string;
    userId: string;
    signal?: AbortSignal;
  }): Promise<
    | { ok: true; link: ShareLink }
    | { ok: false; code: "unauthorized" | "forbidden" | "unconfigured" | "error"; retryable: boolean }
  >;
};

export function createMockShareService(status: ShareServiceStatus = "unconfigured"): ShareService {
  return {
    status: () => status,
    async createLink() {
      if (status !== "ready") {
        return { ok: false, code: "unconfigured", retryable: false };
      }
      return {
        ok: false,
        code: "unauthorized",
        retryable: false,
      };
    },
  };
}
