import { toStoragePath } from "@/lib/media-paths";
import {
  isDecisionSummarySnapshot,
  toPublicDecisionSummary,
} from "@/lib/share-card";
import type {
  PublishedShareMediaItem,
  PublishedShareSnapshot,
  PublicDecisionSummary,
} from "./types";
import { toPublicDecisionSummaryDto } from "./public-dto";

type PublishableViewing = {
  id: string;
  user_id: string;
  address: string;
  pros: string[] | null;
  risks: string[] | null;
  photo_urls: string[] | null;
  property: Record<string, unknown> | null;
  updated_at: string;
};

export type SharePublication = {
  snapshot: PublishedShareSnapshot;
  mediaManifest: PublishedShareMediaItem[];
};

function stableObjectPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const path = toStoragePath(value);
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes(":") ||
    path.split("/").length < 4
  ) return null;
  return path;
}

function ownedViewingPhotoPath(
  value: string | null | undefined,
  viewing: Pick<PublishableViewing, "id" | "user_id" | "photo_urls">,
): string | null {
  const path = stableObjectPath(value);
  if (!path || !path.startsWith(`${viewing.user_id}/${viewing.id}/photos/`)) {
    return null;
  }
  const associated = (viewing.photo_urls ?? [])
    .map((item) => stableObjectPath(item))
    .some((item) => item === path);
  return associated ? path : null;
}

/**
 * Freeze public content at link creation. Selected photos must already have a
 * stable uploaded object path; blob/data/local preview URLs are never published.
 */
export function buildSharePublication(
  viewing: PublishableViewing,
  publishedAt = new Date().toISOString(),
): SharePublication {
  const source = viewing.property?.decisionSummary;
  let decisionSummary: PublicDecisionSummary | null = null;
  const mediaManifest: PublishedShareMediaItem[] = [];

  if (isDecisionSummarySnapshot(source)) {
    const selected = toPublicDecisionSummary(source);
    for (const photo of selected.photos) {
      const path = ownedViewingPhotoPath(photo.remotePath, viewing);
      if (!path) throw new Error("SHARE_MEDIA_NOT_READY");
      mediaManifest.push({ id: String(photo.id), path });
    }
    decisionSummary = {
      ...toPublicDecisionSummaryDto(selected),
      photos: toPublicDecisionSummaryDto(selected).photos.map((photo) => ({
        ...photo,
        url: "",
      })),
    };
  }

  const legacyHighlights = decisionSummary
    ? undefined
    : {
        pros: (viewing.pros ?? []).filter((text) => text.trim()).slice(0, 3),
        risks: (viewing.risks ?? []).filter((text) => text.trim()).slice(0, 3),
      };

  return {
    snapshot: {
      version: 1,
      title: "看房決策摘要",
      address: (decisionSummary?.address || viewing.address || "").trim(),
      updatedAt: viewing.updated_at || null,
      decisionSummary,
      ...(legacyHighlights ? { legacyHighlights } : {}),
      publishedAt,
    },
    mediaManifest,
  };
}

export function isPublishedShareSnapshot(value: unknown): value is PublishedShareSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    row.version === 1 &&
    typeof row.title === "string" &&
    typeof row.address === "string" &&
    typeof row.publishedAt === "string" &&
    (row.decisionSummary === null || typeof row.decisionSummary === "object")
  );
}

export function parseMediaManifest(value: unknown): PublishedShareMediaItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const path = stableObjectPath(typeof row.path === "string" ? row.path : null);
    return typeof row.id === "string" && path ? [{ id: row.id, path }] : [];
  });
}
