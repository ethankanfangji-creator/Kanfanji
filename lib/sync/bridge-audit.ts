import type { MediaItem, ViewingSession } from "@/lib/draft-db";

export type ViewingBridgeAudit = {
  ok: boolean;
  issues: Array<
    | "session_missing"
    | "session_id_mismatch"
    | "address_mismatch"
    | "media_count_mismatch"
    | "media_id_mismatch"
  >;
};

/**
 * Shadow-read verification used while the active-draft store and DraftDb are
 * both present. It never mutates or deletes legacy data.
 */
export function auditViewingSessionBridge(input: {
  expectedSessionId: string;
  expectedAddress: string;
  expectedMediaIds: string[];
  session: ViewingSession | null;
  media: MediaItem[];
}): ViewingBridgeAudit {
  const issues: ViewingBridgeAudit["issues"] = [];
  if (!input.session) {
    issues.push("session_missing");
    return { ok: false, issues };
  }
  if (input.session.id !== input.expectedSessionId) {
    issues.push("session_id_mismatch");
  }
  if (input.session.address !== input.expectedAddress) {
    issues.push("address_mismatch");
  }

  const expectedIds = [...new Set(input.expectedMediaIds)].sort();
  const actualIds = [...new Set(input.media.map((item) => item.id))].sort();
  if (actualIds.length !== expectedIds.length) {
    issues.push("media_count_mismatch");
  }
  if (
    actualIds.length !== expectedIds.length ||
    actualIds.some((id, index) => id !== expectedIds[index])
  ) {
    issues.push("media_id_mismatch");
  }
  return { ok: issues.length === 0, issues };
}
