import { createAdminClient } from "@/utils/supabase/admin";
import { MEDIA_BUCKET } from "@/lib/supabase";
import { toStoragePath } from "@/lib/media-paths";
import {
  assertSharePhotoPath,
  SHARE_MEDIA_SIGNED_TTL_SECONDS,
} from "@/lib/media-sign";
import {
  mapStatusToFailure,
  toPublicSharePayload,
  type PublicShareResult,
} from "@/lib/share-access";
import {
  fetchViewingByShareTokenAdmin,
  fetchShareGateByTokenAdmin,
  gateFromViewing,
  touchShareResolved,
} from "@/lib/share-access/server";
import type {
  PublishedShareMediaItem,
  PublicDecisionSummary,
} from "@/lib/share-access/types";
import type { Viewing } from "@/lib/types";

async function signPublishedPaths(
  pathsOrUrls: string[],
  ownerId: string,
  viewingId: string,
  expiresIn = SHARE_MEDIA_SIGNED_TTL_SECONDS,
): Promise<string[]> {
  if (pathsOrUrls.length === 0) return [];

  const supabase = createAdminClient();
  const paths = pathsOrUrls.map((item) => toStoragePath(item));
  for (const path of paths) {
    if (!path) throw new Error("SHARE_MEDIA_FORBIDDEN");
    assertSharePhotoPath(path, ownerId, viewingId);
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
    JSON.stringify(first.snapshot) === JSON.stringify(second.snapshot) &&
    JSON.stringify(first.mediaManifest) === JSON.stringify(second.mediaManifest)
  );
}

export async function resolvePublicShare(
  token: string,
  _options?: { unlocked?: boolean },
): Promise<PublicShareResult> {
  try {
    const admin = createAdminClient();
    const gateRow = await fetchShareGateByTokenAdmin(admin, token);
    const gate = gateFromViewing(gateRow);
    if (gate === "missing") return mapStatusToFailure("missing");
    if (gate === "revoked") return mapStatusToFailure("revoked");
    if (gate === "closed") return mapStatusToFailure("closed");
    if (gate === "expired") return mapStatusToFailure("expired");
    if (!gateRow) return mapStatusToFailure("missing");
    const accessVersion = gateRow.shareLink.access_version;
    const row = await fetchViewingByShareTokenAdmin(admin, token);
    if (!row) return mapStatusToFailure("missing");
    if (row.shareLink.access_version !== accessVersion) {
      return mapStatusToFailure("forbidden");
    }

    const published = row.snapshot;
    if (published.version === 2 || published.version === 3) {
      const photoUrls = await signPublishedPaths(
        row.mediaManifest.map((item) => item.path),
        row.ownerId,
        row.shareLink.viewing_id,
      );
      const finalRow = await fetchViewingByShareTokenAdmin(admin, token);
      if (!finalRow || !sameRelease(row, finalRow)) {
        const finalGateRow = await fetchShareGateByTokenAdmin(admin, token);
        const finalGate = gateFromViewing(finalGateRow, false);
        return finalGate === "revoked" || finalGate === "expired"
          ? mapStatusToFailure(finalGate)
          : mapStatusToFailure("forbidden");
      }
      void touchShareResolved(admin, finalRow).catch(() => undefined);
      const recipientRaw = finalRow.shareLink.recipient_label;
      const recipientLabel =
        typeof recipientRaw === "string" && recipientRaw.trim()
          ? recipientRaw.trim().slice(0, 40)
          : null;
      return {
        version: 1,
        capability: "read",
        status: "active",
        title: published.title,
        address: published.address,
        updatedAt: published.reportGeneratedAt,
        decisionSummary: null,
        photoUrls,
        chatReport: published,
        meta: {
          passwordProtected: false,
          expiresAt: finalRow.shareLink.expires_at,
          snapshotUpdatedAt: published.publishedAt,
          recipientLabel,
        },
      };
    }
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

    const recipientRaw = finalRow.shareLink.recipient_label;
    const recipientLabel =
      typeof recipientRaw === "string" && recipientRaw.trim()
        ? recipientRaw.trim().slice(0, 40)
        : null;
    return toPublicSharePayload({
      viewing,
      decisionSummary: decision,
      photoUrls:
        decision?.photos.map((p) => p.url).filter(Boolean) ?? [],
      expiresAt: finalRow.shareLink.expires_at ?? null,
      passwordProtected: false,
      snapshotUpdatedAt: published.publishedAt,
      recipientLabel,
    });
  } catch {
    return mapStatusToFailure("error");
  }
}

/**
 * Re-sign published share photos after TTL expiry (same unlock gate as resolvePublicShare).
 * Returns paths → signedUrl list; callers replace expired URLs in the UI.
 */
export async function refreshShareMediaUrls(
  token: string,
  pathsOrUrls: string[],
): Promise<
  | { ok: true; urls: string[]; expiresIn: number }
  | { ok: false; result: PublicShareResult }
> {
  const resolved = await resolvePublicShare(token);
  if (resolved.status !== "active") return { ok: false, result: resolved };

  const admin = createAdminClient();
  const row = await fetchViewingByShareTokenAdmin(admin, token);
  if (!row) return { ok: false, result: mapStatusToFailure("missing") };

  const allowed = new Set(
    row.mediaManifest
      .map((item) => toStoragePath(item.path))
      .filter((path): path is string => typeof path === "string" && path.length > 0),
  );
  const requested = pathsOrUrls
    .map((item) => toStoragePath(item))
    .filter((path): path is string => typeof path === "string" && allowed.has(path));

  if (requested.length === 0) {
    return { ok: true, urls: [], expiresIn: SHARE_MEDIA_SIGNED_TTL_SECONDS };
  }

  const urls = await signPublishedPaths(
    requested,
    row.ownerId,
    row.shareLink.viewing_id,
  );
  return { ok: true, urls, expiresIn: SHARE_MEDIA_SIGNED_TTL_SECONDS };
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
