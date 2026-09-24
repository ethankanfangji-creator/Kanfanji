/**
 * Signed URL helpers for private `viewing-media` objects.
 * Paths are ownerId/viewingId/{photos|videos|audios}/filename — never public URLs.
 */

export const MEDIA_SIGNED_TTL_SECONDS = 60 * 60; // 1 hour (app playback)
export const SHARE_MEDIA_SIGNED_TTL_SECONDS = 30 * 60; // 30 min (share cards; refreshable)

export function isViewingMediaPath(path: string): boolean {
  const parts = path.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length < 4) return false;
  const folder = parts[2];
  return folder === "photos" || folder === "videos" || folder === "audios";
}

/** Owner folder must match auth user unless admin/service signs for share. */
export function assertOwnerMediaPath(path: string, ownerId: string): void {
  const normalized = path.replace(/^\/+/, "");
  if (!isViewingMediaPath(normalized)) {
    throw new Error("INVALID_MEDIA_PATH");
  }
  const ownerFolder = normalized.split("/")[0];
  if (ownerFolder !== ownerId) {
    throw new Error("FORBIDDEN");
  }
}

export function assertSharePhotoPath(
  path: string,
  ownerId: string,
  viewingId: string,
): void {
  const normalized = path.replace(/^\/+/, "");
  const expectedPrefix = `${ownerId}/${viewingId}/photos/`;
  if (!normalized.startsWith(expectedPrefix) || !isViewingMediaPath(normalized)) {
    throw new Error("SHARE_MEDIA_FORBIDDEN");
  }
}

/** True when a signed URL looks expired (best-effort client hint). */
export function isLikelyExpiredSignedUrl(url: string, nowMs = Date.now()): boolean {
  try {
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token");
    // Supabase signed URLs embed expiry in the JWT-like token; fall back to `exp` query.
    const exp = parsed.searchParams.get("exp");
    if (exp && /^\d+$/.test(exp)) {
      return Number(exp) * 1000 < nowMs;
    }
    if (!token) return false;
    const payload = token.split(".")[1];
    if (!payload) return false;
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 < nowMs : false;
  } catch {
    return false;
  }
}
