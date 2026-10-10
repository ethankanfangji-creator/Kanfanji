/**
 * HTTP API contract for share-link access control.
 * Routes exist as stubs returning 501 until migrate-share-links is applied.
 */

export const SHARE_BACKEND_PENDING_CODE = "SHARE_BACKEND_PENDING" as const;

export const shareApiContract = {
  createLink: {
    method: "POST",
    path: "/api/share/links",
    auth: "owner",
    body: "{ viewingId, expiresAt?, capability?: 'read', recipientLabel? }",
    success: "201 CreateShareLinkResponse",
    errors: ["401", "403", "404", "409 RECIPIENT_EXISTS"],
    notes:
      "recipientLabel creates a named recipient/group code; omit/null ensures the general link.",
  },
  getLink: {
    method: "GET",
    path: "/api/share/links?viewingId=",
    auth: "owner",
    success:
      "200 { link: ShareLinkRecord | null /* general */, history: ShareLinkRecord[] }",
    errors: ["401", "403", "404"],
  },
  updateLink: {
    method: "PATCH",
    path: "/api/share/links/:linkId",
    auth: "owner",
    body: "{ expiresAt? }",
    success: "200 { link: ShareLinkRecord }",
    errors: ["401", "403", "404"],
  },
  revokeLink: {
    method: "POST",
    path: "/api/share/links/:linkId/revoke",
    auth: "owner",
    success: "200 { link: ShareLinkRecord }",
    errors: ["401", "403", "404"],
  },
  rotateLink: {
    method: "POST",
    path: "/api/share/links/:linkId/rotate",
    auth: "owner",
    success: "200 RotateShareLinkResponse",
    errors: ["401", "403", "404"],
    notes: "Copies recipientLabel onto the replacement row; old token dies.",
  },
  deleteComment: {
    method: "DELETE",
    path: "/api/share/comments/:id",
    auth: "owner",
    success: "200 { ok: true }",
    errors: ["401", "404", "503"],
  },
  resolvePublic: {
    method: "GET",
    path: "/api/share/public/:token",
    auth: "none",
    success: "200 PublicShareResult",
    notes:
      "Never returns user_id, notes, audio, transcripts, account fields. Soft-close / revoke / expiry only — password sharing retired. meta.recipientLabel exposes named provenance.",
  },
} as const;

export type ShareBackendPendingBody = {
  code: typeof SHARE_BACKEND_PENDING_CODE;
  message: string;
  contract: typeof shareApiContract;
  docs: "/docs/share-access-security.md";
};

export function shareBackendPendingBody(
  feature: string,
): ShareBackendPendingBody {
  return {
    code: SHARE_BACKEND_PENDING_CODE,
    message: `Share access control backend is not enabled yet (${feature}). See docs/share-access-security.md.`,
    contract: shareApiContract,
    docs: "/docs/share-access-security.md",
  };
}
