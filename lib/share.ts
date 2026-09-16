import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { MEDIA_BUCKET } from "@/lib/supabase";
import { toStoragePath } from "@/lib/media-paths";
import {
  isDecisionSummarySnapshot,
  toPublicDecisionSummary,
  type DecisionSummarySnapshot,
} from "@/lib/share-card";
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
  gateFromViewing,
  getShareAccess,
  touchShareResolved,
  type ViewingShareRow,
} from "@/lib/share-access/server";
import type { Viewing } from "@/lib/types";
import { shareTokenFingerprint } from "@/lib/share-access";

async function signPaths(pathsOrUrls: string[], expiresIn = 3600): Promise<string[]> {
  if (pathsOrUrls.length === 0) return [];

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    supabase = await createClient();
  }

  const paths = pathsOrUrls
    .map((item) => toStoragePath(item))
    .filter((p): p is string => Boolean(p));

  if (paths.length === 0) {
    return pathsOrUrls.filter((u) => u.startsWith("http"));
  }

  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(paths, expiresIn);
  if (error || !data) {
    return pathsOrUrls.filter((u) => u.startsWith("http"));
  }
  return data.map((row) => row.signedUrl).filter((u): u is string => Boolean(u));
}

export async function hydrateDecisionSummaryMedia(
  snapshot: DecisionSummarySnapshot,
): Promise<DecisionSummarySnapshot> {
  const pathHints = snapshot.photos.map(
    (photo) => photo.remotePath || photo.url || "",
  );
  const signed = await signPaths(pathHints);
  return {
    ...snapshot,
    photos: snapshot.photos.map((photo, index) => ({
      ...photo,
      url: signed[index] || photo.url || "",
    })),
  };
}

function rowToViewing(row: ViewingShareRow): Viewing {
  const property = { ...(row.property ?? {}) };
  // Never expose shareAccess (password hash) via public payload builders.
  delete property.shareAccess;
  delete property.decisionSummaryDraft;
  delete property.liveAudioMarkers;
  delete property.fieldChecklist;
  return {
    id: "redacted",
    address: row.address,
    tags: row.tags ?? [],
    market: null,
    questions: [],
    notes: [],
    pros: row.pros ?? [],
    risks: row.risks ?? [],
    photo_urls: row.photo_urls ?? [],
    video_urls: [],
    audio_urls: [],
    property,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function resolvePublicShare(
  token: string,
  options?: { unlocked?: boolean },
): Promise<PublicShareResult> {
  try {
    let unlocked = options?.unlocked;
    if (unlocked == null) {
      try {
        const jar = await cookies();
        unlocked = verifyShareUnlockCookieValue(
          token,
          jar.get(shareUnlockCookieName(token))?.value,
        );
      } catch {
        unlocked = false;
      }
    }

    let admin: ReturnType<typeof createAdminClient>;
    try {
      admin = createAdminClient();
    } catch {
      // Without service role, fall back to narrowed RPC (no password/expiry fields).
      return resolveViaLegacyRpc(token);
    }

    const row = await fetchViewingByShareTokenAdmin(admin, token);
    const gate = gateFromViewing(row, Boolean(unlocked));
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
    if (!row) return mapStatusToFailure("missing");

    const access = getShareAccess(row);
    const viewing = rowToViewing(row);
    let decision =
      isDecisionSummarySnapshot(viewing.property?.decisionSummary)
        ? toPublicDecisionSummary(viewing.property.decisionSummary)
        : null;
    if (decision) {
      decision = await hydrateDecisionSummaryMedia(decision);
    } else {
      viewing.photo_urls = await signPaths(viewing.photo_urls ?? []);
    }

    void touchShareResolved(admin, row).catch(() => undefined);

    return toPublicSharePayload({
      viewing,
      decisionSummary: decision,
      photoUrls:
        decision?.photos.map((p) => p.url).filter(Boolean) ?? viewing.photo_urls,
      expiresAt: access?.expiresAt ?? null,
      passwordProtected: Boolean(access?.passwordHash),
      snapshotUpdatedAt: decision?.generatedAt ?? viewing.updated_at,
    });
  } catch {
    return mapStatusToFailure("error");
  }
}

async function resolveViaLegacyRpc(token: string): Promise<PublicShareResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_viewing_by_share_token", {
    p_token: token.trim(),
  });
  if (error || !data?.[0]) return mapStatusToFailure("missing");
  const row = data[0] as {
    address?: string;
    tags?: string[];
    pros?: string[];
    risks?: string[];
    photo_urls?: string[];
    property?: Record<string, unknown>;
    updated_at?: string;
    created_at?: string;
  };
  if (!row.address) return mapStatusToFailure("missing");
  const viewing: Viewing = {
    id: "redacted",
    address: row.address,
    tags: row.tags ?? [],
    market: null,
    questions: [],
    notes: [],
    pros: row.pros ?? [],
    risks: row.risks ?? [],
    photo_urls: row.photo_urls ?? [],
    video_urls: [],
    audio_urls: [],
    property: row.property ?? {},
    created_at: row.created_at ?? new Date(0).toISOString(),
    updated_at: row.updated_at ?? new Date(0).toISOString(),
  };
  let decision = isDecisionSummarySnapshot(viewing.property?.decisionSummary)
    ? toPublicDecisionSummary(viewing.property.decisionSummary)
    : null;
  if (decision) decision = await hydrateDecisionSummaryMedia(decision);
  else viewing.photo_urls = await signPaths(viewing.photo_urls ?? []);
  return toPublicSharePayload({
    viewing,
    decisionSummary: decision,
    photoUrls:
      decision?.photos.map((p) => p.url).filter(Boolean) ?? viewing.photo_urls,
    snapshotUpdatedAt: decision?.generatedAt ?? viewing.updated_at,
  });
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

/** @deprecated */
export async function hydrateViewingMedia(viewing: Viewing): Promise<Viewing> {
  const photo_urls = await signPaths(viewing.photo_urls ?? []);
  const property = viewing.property ? { ...viewing.property } : null;
  if (property && isDecisionSummarySnapshot(property.decisionSummary)) {
    property.decisionSummary = await hydrateDecisionSummaryMedia(
      toPublicDecisionSummary(property.decisionSummary),
    );
  }
  return {
    ...viewing,
    photo_urls,
    video_urls: [],
    audio_urls: [],
    notes: [],
    questions: [],
    property,
  };
}
