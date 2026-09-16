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
    body: "{ viewingId, expiresAt?, password?, capability?: 'read' }",
    success: "201 CreateShareLinkResponse",
    errors: ["401", "403", "404"],
  },
  getLink: {
    method: "GET",
    path: "/api/share/links?viewingId=",
    auth: "owner",
    success: "200 { link: ShareLinkRecord | null }",
    errors: ["401", "403", "404"],
  },
  updateLink: {
    method: "PATCH",
    path: "/api/share/links/:linkId",
    auth: "owner",
    body: "{ expiresAt?, password? }",
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
  },
  resolvePublic: {
    method: "GET",
    path: "/api/share/public/:token",
    auth: "none",
    success: "200 PublicShareResult",
    notes:
      "Never returns user_id, notes, audio, transcripts, account fields. Password gate does not include viewing id.",
  },
  unlockPublic: {
    method: "POST",
    path: "/api/share/public/:token/unlock",
    auth: "none",
    body: "{ password }",
    success: "200 UnlockShareResponse + httpOnly cookie",
    errors: ["401 invalid password", "410 expired/revoked", "404"],
    notes: "Password must not be written to URL, logs, or analytics.",
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
