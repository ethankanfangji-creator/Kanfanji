import { z } from "zod";
import { extractConfirmedMapCoords } from "@/lib/map/open-in-maps";
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

const ShareCoordsSchema = z.object({
  lat: z.number().finite().gte(-90).lte(90),
  lng: z.number().finite().gte(-180).lte(180),
});

type PublishableViewing = {
  id: string;
  user_id: string;
  address: string;
  pros: string[] | null;
  risks: string[] | null;
  photo_urls: string[] | null;
  property: Record<string, unknown> | null;
  updated_at: string;
  chat_state?: unknown;
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

  const coords = extractConfirmedMapCoords({
    chatState: viewing.chat_state,
    property: viewing.property,
  });

  return {
    snapshot: {
      version: 1,
      title: "看房決策摘要",
      address: (decisionSummary?.address || viewing.address || "").trim(),
      updatedAt: viewing.updated_at || null,
      decisionSummary: decisionSummary
        ? {
            ...decisionSummary,
            ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
          }
        : null,
      ...(legacyHighlights ? { legacyHighlights } : {}),
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      publishedAt,
    },
    mediaManifest,
  };
}

const SHARE_REPORT_PHOTO_LIMIT = 24;
const SHARE_SUMMARY_MAX_CHARS = 12_000;
const SHARE_SECTION_MAX_CHARS = 8_000;
const SHARE_LIST_LIMIT = 20;

function scrubShareText(value: string, max = 300): string {
  return value.replace(/[\u0000-\u001F]/g, "").slice(0, max);
}

function scrubOptionalSection(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const scrubbed = scrubShareText(value, SHARE_SECTION_MAX_CHARS).trim();
  return scrubbed || undefined;
}

function scrubStringList(value: unknown, limit = SHARE_LIST_LIMIT): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => scrubShareText(item))
    .filter(Boolean)
    .slice(0, limit);
}

function chatReportImageManifest(
  viewing: {
    id: string;
    user_id: string;
    photo_urls?: string[] | null;
    report: unknown;
  },
): PublishedShareMediaItem[] {
  const report = (
    viewing.report && typeof viewing.report === "object" ? viewing.report : {}
  ) as {
    mediaRefs?: Array<{ id?: string; kind?: string; path?: string | null }>;
  };
  const refs = Array.isArray(report.mediaRefs) ? report.mediaRefs : [];
  const seen = new Set<string>();
  const mediaManifest: PublishedShareMediaItem[] = [];
  for (const ref of refs) {
    if (ref?.kind !== "image") continue;
    const path = ownedViewingPhotoPath(ref.path, {
      id: viewing.id,
      user_id: viewing.user_id,
      photo_urls: viewing.photo_urls ?? null,
    });
    if (!path || seen.has(path)) continue;
    seen.add(path);
    mediaManifest.push({
      id: scrubShareText(String(ref.id || path), 80) || path,
      path,
    });
    if (mediaManifest.length >= SHARE_REPORT_PHOTO_LIMIT) break;
  }
  return mediaManifest;
}

const ShareReportMetaSchema = z
  .object({
    viewingDate: z.string().nullable().optional(),
    propertyType: z.string().nullable().optional(),
    yearBuilt: z.string().nullable().optional(),
    askingPrice: z.string().nullable().optional(),
    lotSize: z.string().nullable().optional(),
    interiorSize: z.string().nullable().optional(),
    layout: z.string().nullable().optional(),
    neighborhood: z.string().nullable().optional(),
  })
  .strict();

const ShareReportScoresSchema = z
  .object({
    items: z
      .array(
        z.object({
          label: z.string(),
          score: z.number(),
        }),
      )
      .max(16),
    overall: z.string().optional(),
    highlight: z.string().optional(),
    biggestQuestion: z.string().optional(),
  })
  .strict();

/** Legacy frozen chat-report snapshots (pre sectioned notes reports). */
export const ChatReportShareSnapshotV2Schema = z
  .object({
    version: z.literal(2),
    kind: z.literal("chat_report"),
    title: z.string(),
    address: z.string(),
    publishedAt: z.string(),
    reportGeneratedAt: z.string(),
    summary: z.string().nullable(),
    pros: z.array(z.string()).max(3),
    risks: z.array(z.string()).max(3),
    followUps: z.array(z.string()).max(3).default([]),
    checklist: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string(),
          status: z.enum(["ok", "risk", "unknown"]),
        }),
      )
      .max(20),
    fields: z.array(
      z.object({
        fieldId: z.string(),
        value: z.string(),
        status: z.enum(["confirmed", "subjective", "inferred", "corrected"]),
      }),
    ),
  })
  .strict();

/** Sectioned notes-report snapshot aligned with ReportSectionsView. */
export const ChatReportShareSnapshotSchema = z
  .object({
    version: z.literal(3),
    kind: z.literal("chat_report"),
    title: z.string(),
    address: z.string(),
    publishedAt: z.string(),
    reportGeneratedAt: z.string(),
    summary: z.string().nullable(),
    meta: ShareReportMetaSchema.optional(),
    overview: z.string().optional(),
    interior: z.string().optional(),
    outdoorLand: z.string().optional(),
    transitLifestyle: z.string().optional(),
    pricing: z.string().optional(),
    pros: z.array(z.string()).max(SHARE_LIST_LIMIT),
    risks: z.array(z.string()).max(SHARE_LIST_LIMIT),
    scores: ShareReportScoresSchema.optional(),
    verdict: z.string().optional(),
    nextSteps: z.array(z.string()).max(SHARE_LIST_LIMIT).optional(),
    /** Confirmed site pin (or property coords) for map cover + open-in-maps. */
    lat: ShareCoordsSchema.shape.lat.optional(),
    lng: ShareCoordsSchema.shape.lng.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasLat = value.lat != null;
    const hasLng = value.lng != null;
    if (hasLat !== hasLng) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lat and lng must both be set",
        path: hasLat ? ["lng"] : ["lat"],
      });
    }
  });

export type ChatReportShareSnapshotV2 = z.infer<typeof ChatReportShareSnapshotV2Schema>;
export type ChatReportShareSnapshot = z.infer<typeof ChatReportShareSnapshotSchema>;
export type AnyChatReportShareSnapshot = ChatReportShareSnapshot | ChatReportShareSnapshotV2;

export class ReportNotReadyError extends Error {
  constructor() {
    super("REPORT_NOT_READY");
    this.name = "ReportNotReadyError";
  }
}

export function buildChatReportPublication(viewing: {
  id: string;
  user_id: string;
  address: string;
  report: unknown;
  chat_state: unknown;
  updated_at: string;
  photo_urls?: string[] | null;
  property?: Record<string, unknown> | null;
}): { snapshot: ChatReportShareSnapshot; mediaManifest: PublishedShareMediaItem[] } {
  const coords = extractConfirmedMapCoords({
    chatState: viewing.chat_state,
    property: viewing.property,
  });
  const report = (
    viewing.report && typeof viewing.report === "object" ? viewing.report : {}
  ) as {
    title?: string;
    summary?: string;
    meta?: unknown;
    overview?: string;
    interior?: string;
    outdoorLand?: string;
    transitLifestyle?: string;
    pricing?: string;
    pros?: string[];
    risks?: string[];
    scores?: unknown;
    verdict?: string;
    nextSteps?: string[];
    generatedAt?: string;
  };

  const metaRaw =
    report.meta && typeof report.meta === "object" && !Array.isArray(report.meta)
      ? (report.meta as Record<string, unknown>)
      : null;
  const meta = metaRaw
    ? ShareReportMetaSchema.safeParse({
        viewingDate:
          typeof metaRaw.viewingDate === "string"
            ? scrubShareText(metaRaw.viewingDate, 120) || null
            : metaRaw.viewingDate === null
              ? null
              : undefined,
        propertyType:
          typeof metaRaw.propertyType === "string"
            ? scrubShareText(metaRaw.propertyType, 120) || null
            : metaRaw.propertyType === null
              ? null
              : undefined,
        yearBuilt:
          typeof metaRaw.yearBuilt === "string"
            ? scrubShareText(metaRaw.yearBuilt, 80) || null
            : metaRaw.yearBuilt === null
              ? null
              : undefined,
        askingPrice:
          typeof metaRaw.askingPrice === "string"
            ? scrubShareText(metaRaw.askingPrice, 120) || null
            : metaRaw.askingPrice === null
              ? null
              : undefined,
        lotSize:
          typeof metaRaw.lotSize === "string"
            ? scrubShareText(metaRaw.lotSize, 120) || null
            : metaRaw.lotSize === null
              ? null
              : undefined,
        interiorSize:
          typeof metaRaw.interiorSize === "string"
            ? scrubShareText(metaRaw.interiorSize, 120) || null
            : metaRaw.interiorSize === null
              ? null
              : undefined,
        layout:
          typeof metaRaw.layout === "string"
            ? scrubShareText(metaRaw.layout, 120) || null
            : metaRaw.layout === null
              ? null
              : undefined,
        neighborhood:
          typeof metaRaw.neighborhood === "string"
            ? scrubShareText(metaRaw.neighborhood, 160) || null
            : metaRaw.neighborhood === null
              ? null
              : undefined,
      }).data
    : undefined;

  let scores: z.infer<typeof ShareReportScoresSchema> | undefined;
  if (report.scores && typeof report.scores === "object" && !Array.isArray(report.scores)) {
    const row = report.scores as Record<string, unknown>;
    const items = Array.isArray(row.items)
      ? row.items.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const label = scrubShareText(String((item as { label?: unknown }).label ?? ""), 80);
          const scoreRaw = (item as { score?: unknown }).score;
          const score = typeof scoreRaw === "number" ? scoreRaw : Number(scoreRaw);
          if (!label || !Number.isFinite(score)) return [];
          return [{ label, score }];
        }).slice(0, 16)
      : [];
    const overall =
      typeof row.overall === "string" ? scrubShareText(row.overall, 80) || undefined : undefined;
    const highlight =
      typeof row.highlight === "string"
        ? scrubShareText(row.highlight, 500) || undefined
        : undefined;
    const biggestQuestion =
      typeof row.biggestQuestion === "string"
        ? scrubShareText(row.biggestQuestion, 500) || undefined
        : undefined;
    if (items.length || overall || highlight || biggestQuestion) {
      scores = { items, overall, highlight, biggestQuestion };
    }
  }

  const reportTitle = scrubOptionalSection(report.title);
  const snapshot = ChatReportShareSnapshotSchema.parse({
    version: 3,
    kind: "chat_report",
    title: reportTitle || "看房報告",
    address: scrubShareText(viewing.address),
    publishedAt: new Date().toISOString(),
    reportGeneratedAt: report.generatedAt ?? viewing.updated_at,
    summary: report.summary
      ? scrubShareText(report.summary, SHARE_SUMMARY_MAX_CHARS)
      : null,
    ...(meta ? { meta } : {}),
    ...(scrubOptionalSection(report.overview)
      ? { overview: scrubOptionalSection(report.overview) }
      : {}),
    ...(scrubOptionalSection(report.interior)
      ? { interior: scrubOptionalSection(report.interior) }
      : {}),
    ...(scrubOptionalSection(report.outdoorLand)
      ? { outdoorLand: scrubOptionalSection(report.outdoorLand) }
      : {}),
    ...(scrubOptionalSection(report.transitLifestyle)
      ? { transitLifestyle: scrubOptionalSection(report.transitLifestyle) }
      : {}),
    ...(scrubOptionalSection(report.pricing)
      ? { pricing: scrubOptionalSection(report.pricing) }
      : {}),
    pros: scrubStringList(report.pros),
    risks: scrubStringList(report.risks),
    ...(scores ? { scores } : {}),
    ...(scrubOptionalSection(report.verdict)
      ? { verdict: scrubOptionalSection(report.verdict) }
      : {}),
    ...(scrubStringList(report.nextSteps).length
      ? { nextSteps: scrubStringList(report.nextSteps) }
      : {}),
    ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
  });
  const mediaManifest = chatReportImageManifest(viewing);
  const encoded = JSON.stringify(snapshot);
  if (encoded.includes(viewing.id) || encoded.includes(viewing.user_id)) {
    throw new Error("SHARE_SNAPSHOT_LEAK");
  }
  return { snapshot, mediaManifest };
}

export function isPublishedShareSnapshot(
  value: unknown,
): value is PublishedShareSnapshot | AnyChatReportShareSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.version === 3) return ChatReportShareSnapshotSchema.safeParse(value).success;
  if (row.version === 2) return ChatReportShareSnapshotV2Schema.safeParse(value).success;
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
