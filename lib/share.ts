import { cookies } from "next/headers";
import { createAdminClient } from "@/utils/supabase/admin";
import { MEDIA_BUCKET } from "@/lib/supabase";
import { toStoragePath } from "@/lib/media-paths";
import {
  mapStatusToFailure,
  toPublicSharePayload,
  type PublicShareResult,
} from "@/lib/share-access";
import {
  shareUnlockCookieName,
  verifyShareUnlockCookieValue,
} from "@/lib/share-access/cookie";
import {
  fetchViewingByShareTokenAdmin,
  fetchShareGateByTokenAdmin,
  gateFromViewing,
  getShareAccess,
  touchShareResolved,
} from "@/lib/share-access/server";
import type {
  PublishedShareMediaItem,
  PublicDecisionSummary,
} from "@/lib/share-access/types";
import type { Viewing } from "@/lib/types";
import { shareTokenFingerprint } from "@/lib/share-access";

async function signPublishedPaths(
  pathsOrUrls: string[],
  ownerId: string,
  viewingId: string,
  expiresIn = 3600,
): Promise<string[]> {
  if (pathsOrUrls.length === 0) return [];

  const supabase = createAdminClient();
  const expectedPrefix = `${ownerId}/${viewingId}/photos/`;
  const paths = pathsOrUrls.map((item) => toStoragePath(item));
  if (paths.some((path) => !path || !path.startsWith(expectedPrefix))) {
    throw new Error("SHARE_MEDIA_FORBIDDEN");
  }

  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(paths as string[], expiresIn);
  if (error || !data) {
    throw new Error("SHARE_MEDIA_SIGN_FAILED");
  }
  return data.map((row) => row.signedUrl).filter((u): u is string => Boolean(u));
}
function snapshotToViewing(input: {
  address: string;
  updatedAt: string | null;
  decisionSummary: PublicDecisionSummary | null;
  legacyHighlights?: { pros: string[]; risks: string[] };
}): Viewing {
  return {
    id: "redacted",
    address: input.address,
    tags: [],
    market: null,
    questions: [],
    notes: [],
    pros: input.legacyHighlights?.pros ?? [],
    risks: input.legacyHighlights?.risks ?? [],
    photo_urls: [],
    video_urls: [],
    audio_urls: [],
    property: input.decisionSummary
      ? { decisionSummary: input.decisionSummary }
      : {},
    created_at: input.updatedAt ?? new Date(0).toISOString(),
    updated_at: input.updatedAt ?? new Date(0).toISOString(),
  };
}

async function hydratePublishedDecisionSummary(
  summary: PublicDecisionSummary,
  manifest: PublishedShareMediaItem[],
  ownerId: string,
  viewingId: string,
): Promise<PublicDecisionSummary> {
  const byId = new Map(manifest.map((item) => [item.id, item.path]));
  const publishable = summary.photos.flatMap((photo) => {
    const path = byId.get(photo.id);
    return path ? [{ photo, path }] : [];
  });
  const signed = await signPublishedPaths(
    publishable.map((item) => item.path),
    ownerId,
    viewingId,
  );
  return {
    ...summary,
    photos: publishable.flatMap(({ photo }, index) =>
      signed[index] ? [{ ...photo, url: signed[index] }] : [],
    ),
  };
}

function sameRelease(first: Awaited<ReturnType<typeof fetchViewingByShareTokenAdmin>>, second: Awaited<ReturnType<typeof fetchViewingByShareTokenAdmin>>): boolean {
  if (!first || !second) return false;
  return (
    first.ownerId === second.ownerId &&
    first.shareLink.id === second.shareLink.id &&
    first.shareLink.access_version === second.shareLink.access_version &&
    first.shareLink.status === second.shareLink.status &&
    first.shareLink.expires_at === second.shareLink.expires_at &&
    first.shareLink.password_hash === second.shareLink.password_hash &&
    JSON.stringify(first.snapshot) === JSON.stringify(second.snapshot) &&
    JSON.stringify(first.mediaManifest) === JSON.stringify(second.mediaManifest)
  );
}

export async function resolvePublicShare(
  token: string,
  options?: { unlocked?: boolean },
): Promise<PublicShareResult> {
  try {
    const admin = createAdminClient();
    const gateRow = await fetchShareGateByTokenAdmin(admin, token);
    const access = gateRow ? getShareAccess(gateRow) : null;
    let unlocked = options?.unlocked;
    if (unlocked == null && access) {
      try {
        const jar = await cookies();
        unlocked = verifyShareUnlockCookieValue(
          token,
          access.access_version,
          jar.get(shareUnlockCookieName(token))?.value,
        );
      } catch {
        unlocked = false;
      }
    }
    const gate = gateFromViewing(gateRow, Boolean(unlocked));
    if (gate === "missing") return mapStatusToFailure("missing");
    if (gate === "revoked") return mapStatusToFailure("revoked");
    if (gate === "expired") return mapStatusToFailure("expired");
    if (gate === "password_required") {
      return {
        version: 1,
        status: "password_required",
        challengeId: shareTokenFingerprint(token),
        message: "此分享受密碼保護，請輸入密碼後繼續。",
      };
    }
    if (!gateRow) return mapStatusToFailure("missing");
    const row = await fetchViewingByShareTokenAdmin(admin, token);
    if (!row) return mapStatusToFailure("missing");
    if (
      row.shareLink.access_version !== access?.access_version ||
      row.shareLink.password_hash !== access?.password_hash
    ) {
      return mapStatusToFailure("forbidden");
    }

    const published = row.snapshot;
    let decision = published.decisionSummary;
    if (decision) {
      decision = await hydratePublishedDecisionSummary(
        decision,
        row.mediaManifest,
        row.ownerId,
        row.shareLink.viewing_id,
      );
    }
    const viewing = snapshotToViewing({
      address: published.address,
      updatedAt: published.updatedAt,
      decisionSummary: decision,
      legacyHighlights: published.legacyHighlights,
    });

    // Signing can take network time. Re-read the complete gate and frozen
    // publication immediately before release so revoke/password/expiry changes
    // cannot expose the signed URLs from a stale resolution.
    const finalRow = await fetchViewingByShareTokenAdmin(admin, token);
    if (!finalRow || !sameRelease(row, finalRow)) {
      const finalGateRow = await fetchShareGateByTokenAdmin(admin, token);
      const finalGate = gateFromViewing(finalGateRow, false);
      return finalGate === "revoked" || finalGate === "expired"
        ? mapStatusToFailure(finalGate)
        : mapStatusToFailure("forbidden");
    }

    void touchShareResolved(admin, finalRow).catch(() => undefined);

    return toPublicSharePayload({
      viewing,
      decisionSummary: decision,
      photoUrls:
        decision?.photos.map((p) => p.url).filter(Boolean) ?? [],
      expiresAt: finalRow.shareLink.expires_at ?? null,
      passwordProtected: Boolean(finalRow.shareLink.password_hash),
      snapshotUpdatedAt: published.publishedAt,
    });
  } catch {
    return mapStatusToFailure("error");
  }
}

/** @deprecated Prefer resolvePublicShare */
export async function fetchViewingByShareToken(token: string): Promise<Viewing | null> {
  const result = await resolvePublicShare(token);
  if (result.status !== "active") return null;
  return {
    id: "redacted",
    address: result.address,
    tags: [],
    market: null,
    questions: [],
    notes: [],
    photo_urls: result.photoUrls,
    video_urls: [],
    audio_urls: [],
    property: result.decisionSummary
      ? { decisionSummary: result.decisionSummary }
      : {},
    created_at: result.updatedAt ?? new Date(0).toISOString(),
    updated_at: result.updatedAt ?? new Date(0).toISOString(),
  };
}
